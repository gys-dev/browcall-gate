import WebSocket from 'ws';
import {
  LocalBridgeConnection,
  GatewayWsMessage,
  McpTool,
  McpResource,
  McpPrompt,
  JsonRpcRequest,
  JsonRpcResponse,
} from '../types';

interface PendingRequest {
  resolve: (response: JsonRpcResponse) => void;
  reject: (error: Error) => void;
  timeoutTimer: NodeJS.Timeout;
}

export class BridgeManager {
  private connections = new Map<string, LocalBridgeConnection>();
  private pendingRequests = new Map<string | number, PendingRequest>();

  /**
   * Register a new Local MCP Bridge connection
   */
  public registerConnection(
    ws: WebSocket,
    bridgeId: string,
    clientName?: string,
    tools: McpTool[] = [],
    resources: McpResource[] = [],
    prompts: McpPrompt[] = [],
    workspaceId?: string
  ): LocalBridgeConnection {
    const connectionId = `${bridgeId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const connection: LocalBridgeConnection = {
      connectionId,
      bridgeId,
      workspaceId,
      ws,
      connectedAt: new Date(),
      clientName: clientName || 'Local MCP Bridge',
      tools,
      resources,
      prompts,
      lastSeen: new Date(),
    };

    this.connections.set(connectionId, connection);
    console.log(
      `[BridgeManager] Registered bridge: ${bridgeId} (Connection ID: ${connectionId}, Tools: ${tools.length})`
    );
    return connection;
  }

  /**
   * Remove a connection
   */
  public removeConnection(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      console.log(`[BridgeManager] Removing bridge connection: ${conn.bridgeId} (${connectionId})`);
      this.connections.delete(connectionId);
    }
  }

  /**
   * Get active connection by connectionId or bridgeId (or returns the default/first available if not specified)
   */
  public getBridge(id?: string): LocalBridgeConnection | undefined {
    if (id) {
      // Direct match by connectionId
      const byConnId = this.connections.get(id);
      if (byConnId) return byConnId;

      // Match by bridgeId
      for (const conn of this.connections.values()) {
        if (conn.bridgeId === id) {
          return conn;
        }
      }
    }
    // Return first active bridge if no specific ID requested
    const active = Array.from(this.connections.values());
    return active.length > 0 ? active[0] : undefined;
  }

  /**
   * Get active connection by workspaceId
   */
  public getBridgeByWorkspace(workspaceId: string): LocalBridgeConnection | undefined {
    for (const conn of this.connections.values()) {
      if (conn.workspaceId === workspaceId) {
        return conn;
      }
    }
    return undefined;
  }

  /**
   * Get all active bridges
   */
  public getAllBridges(): LocalBridgeConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Aggregate tools across all connected bridges, merging tools per project/bridge
   */
  public getAggregatedTools(workspaceId?: string): McpTool[] {
    const activeBridges = Array.from(this.connections.values()).filter(
      (bridge) => !workspaceId || bridge.workspaceId === workspaceId
    );
    const toolNameCounts = new Map<string, number>();

    for (const bridge of activeBridges) {
      for (const t of bridge.tools) {
        toolNameCounts.set(t.name, (toolNameCounts.get(t.name) || 0) + 1);
      }
    }

    const aggregated: McpTool[] = [];
    const seenNames = new Set<string>();

    for (const bridge of activeBridges) {
      for (const t of bridge.tools) {
        const count = toolNameCounts.get(t.name) || 1;
        let displayName = t.name;

        // Disambiguate tools with identical names across bridges
        if (count > 1) {
          const primaryPrefix = bridge.workspaceId || bridge.bridgeId;
          displayName = `${primaryPrefix}__${t.name}`;
          if (seenNames.has(displayName)) {
            displayName = `${bridge.connectionId}__${t.name}`;
          }
        }
        seenNames.add(displayName);

        aggregated.push({
          ...t,
          name: displayName,
          serverName: t.serverName || bridge.workspaceId || bridge.bridgeId,
          description:
            count > 1
              ? `[Workspace/Bridge: ${bridge.workspaceId || bridge.clientName || bridge.bridgeId}] ${t.description || ''}`
              : t.description,
        });
      }
    }
    return aggregated;
  }

  /**
   * Aggregate resources across all connected bridges
   */
  public getAggregatedResources(workspaceId?: string): McpResource[] {
    const aggregated: McpResource[] = [];
    for (const bridge of this.connections.values()) {
      if (workspaceId && bridge.workspaceId !== workspaceId) continue;
      (bridge.resources || []).forEach((r) => {
        aggregated.push({
          ...r,
          serverName: r.serverName || bridge.workspaceId || bridge.bridgeId,
        });
      });
    }
    return aggregated;
  }

  /**
   * Aggregate prompts across all connected bridges
   */
  public getAggregatedPrompts(workspaceId?: string): McpPrompt[] {
    const aggregated: McpPrompt[] = [];
    for (const bridge of this.connections.values()) {
      if (workspaceId && bridge.workspaceId !== workspaceId) continue;
      (bridge.prompts || []).forEach((p) => {
        aggregated.push({
          ...p,
          serverName: p.serverName || bridge.workspaceId || bridge.bridgeId,
        });
      });
    }
    return aggregated;
  }

  /**
   * Update tools list for a connection
   */
  public updateBridgeTools(identifier: string, tools: McpTool[]): void {
    let conn = this.connections.get(identifier);
    if (!conn) {
      conn = this.getBridge(identifier);
    }
    if (conn) {
      conn.tools = tools;
      conn.lastSeen = new Date();
      console.log(
        `[BridgeManager] Updated tools for bridge ${conn.bridgeId} (${conn.connectionId}): ${tools.length} tools`
      );
    }
  }

  /**
   * Forward a JSON-RPC request to a Local MCP Bridge and wait for correlated response.
   * Dynamically distributes requests to the target bridge socket based on prefix or tool ownership.
   */
  public async forwardRequest(
    request: JsonRpcRequest,
    targetBridgeId?: string,
    timeoutMs = 30000,
    targetWorkspaceId?: string
  ): Promise<JsonRpcResponse> {
    let targetBridge: LocalBridgeConnection | undefined;

    const clonedParams = request.params ? { ...request.params } : undefined;

    // 1. Check explicit workspace or bridge target
    if (targetWorkspaceId && clonedParams && request.method === 'tools/call') {
      const toolName = typeof clonedParams.name === 'string' ? clonedParams.name : '';
      targetBridge = Array.from(this.connections.values()).find(
        (conn) =>
          conn.workspaceId === targetWorkspaceId &&
          (conn.tools.some((tool) => tool.name === toolName) ||
            toolName.startsWith(`${conn.bridgeId}__`) ||
            (conn.workspaceId && toolName.startsWith(`${conn.workspaceId}__`)))
      );
      if (targetBridge) {
        if (targetBridge.workspaceId && toolName.startsWith(`${targetBridge.workspaceId}__`)) {
          clonedParams.name = toolName.slice(`${targetBridge.workspaceId}__`.length);
        } else if (toolName.startsWith(`${targetBridge.bridgeId}__`)) {
          clonedParams.name = toolName.slice(`${targetBridge.bridgeId}__`.length);
        }
      }
    }
    if (!targetBridge && targetWorkspaceId) {
      targetBridge = this.getBridgeByWorkspace(targetWorkspaceId);
    }
    if (!targetBridge && targetBridgeId && !targetWorkspaceId) {
      targetBridge = this.getBridge(targetBridgeId);
    }

    // 2. Smart routing based on method and payload matching
    if (!targetBridge && targetWorkspaceId) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32001,
          message: `No active bridge connection found for workspace '${targetWorkspaceId}'`,
        },
      };
    }
    if (!targetBridge && clonedParams) {
      if (request.method === 'tools/call' && typeof clonedParams.name === 'string') {
        const rawName = clonedParams.name;

        // Check if rawName has a workspaceId__, bridgeId__, or connectionId__ prefix
        for (const conn of this.connections.values()) {
          const prefixWsId = conn.workspaceId ? `${conn.workspaceId}__` : null;
          const prefixId = `${conn.bridgeId}__`;
          const prefixConnId = `${conn.connectionId}__`;

          if (prefixWsId && rawName.startsWith(prefixWsId)) {
            targetBridge = conn;
            clonedParams.name = rawName.slice(prefixWsId.length);
            break;
          }
          if (rawName.startsWith(prefixId)) {
            targetBridge = conn;
            clonedParams.name = rawName.slice(prefixId.length);
            break;
          }
          if (rawName.startsWith(prefixConnId)) {
            targetBridge = conn;
            clonedParams.name = rawName.slice(prefixConnId.length);
            break;
          }
        }

        // If no prefix match, search active bridges for tool ownership
        if (!targetBridge) {
          for (const conn of this.connections.values()) {
            if (conn.tools.some((t) => t.name === rawName)) {
              targetBridge = conn;
              break;
            }
          }
        }
      } else if (request.method === 'resources/read' && typeof clonedParams.uri === 'string') {
        const uri = clonedParams.uri;
        for (const conn of this.connections.values()) {
          if ((conn.resources || []).some((r) => r.uri === uri)) {
            targetBridge = conn;
            break;
          }
        }
      } else if (request.method === 'prompts/get' && typeof clonedParams.name === 'string') {
        const promptName = clonedParams.name;
        for (const conn of this.connections.values()) {
          if ((conn.prompts || []).some((p) => p.name === promptName)) {
            targetBridge = conn;
            break;
          }
        }
      }
    }

    // 3. Fallback to first active bridge
    if (!targetBridge) {
      targetBridge = this.getBridge();
    }

    if (!targetBridge) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32001,
          message: targetWorkspaceId
            ? `No active bridge connection found for workspace '${targetWorkspaceId}'`
            : targetBridgeId
              ? `No active bridge connection found with bridgeId '${targetBridgeId}'`
              : 'No connected Local MCP Bridge available on Gateway',
        },
      };
    }

    const requestId = request.id ?? `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const forwardedPayload = clonedParams
      ? { ...request, params: clonedParams, id: requestId }
      : { ...request, id: requestId };

    const forwardedMsg: GatewayWsMessage = {
      type: 'request',
      requestId,
      bridgeId: targetBridge.bridgeId,
      payload: forwardedPayload,
    };

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32000,
            message: `Gateway request to bridge '${targetBridge.bridgeId}' timed out after ${timeoutMs}ms`,
          },
        });
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: (resp: JsonRpcResponse) => {
          resolve({ ...resp, id: request.id });
        },
        reject,
        timeoutTimer,
      });

      try {
        targetBridge.ws.send(JSON.stringify(forwardedMsg));
      } catch (err: any) {
        clearTimeout(timeoutTimer);
        this.pendingRequests.delete(requestId);
        resolve({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32002,
            message: `Failed to send WebSocket message to bridge '${targetBridge.bridgeId}': ${err?.message || err}`,
          },
        });
      }
    });
  }

  /**
   * Handle incoming WebSocket response from a Local MCP Bridge
   */
  public handleBridgeResponse(msg: GatewayWsMessage): void {
    if (!msg.requestId) return;

    const pending = this.pendingRequests.get(msg.requestId);
    if (pending) {
      clearTimeout(pending.timeoutTimer);
      this.pendingRequests.delete(msg.requestId);

      const jsonRpcResp: JsonRpcResponse = msg.payload || {
        jsonrpc: '2.0',
        id: msg.requestId,
        result: msg.payload,
      };
      pending.resolve(jsonRpcResp);
    }
  }
}

