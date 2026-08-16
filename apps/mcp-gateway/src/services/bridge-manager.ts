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
    prompts: McpPrompt[] = []
  ): LocalBridgeConnection {
    const connectionId = `${bridgeId}-${Date.now()}`;
    const connection: LocalBridgeConnection = {
      connectionId,
      bridgeId,
      ws,
      connectedAt: new Date(),
      clientName: clientName || 'Local MCP Bridge',
      tools,
      resources,
      prompts,
      lastSeen: new Date(),
    };

    // If an old bridge with the same bridgeId exists, close its WS connection
    for (const [id, conn] of this.connections.entries()) {
      if (conn.bridgeId === bridgeId && conn.connectionId !== connectionId) {
        console.log(`[BridgeManager] Replacing existing bridge connection: ${id}`);
        try {
          conn.ws.close();
        } catch {
          // ignore error on close
        }
        this.connections.delete(id);
      }
    }

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
   * Get active connection by bridgeId (or returns the default/first available if not specified)
   */
  public getBridge(bridgeId?: string): LocalBridgeConnection | undefined {
    if (bridgeId) {
      for (const conn of this.connections.values()) {
        if (conn.bridgeId === bridgeId) {
          return conn;
        }
      }
    }
    // Return first active bridge if no specific bridgeId requested
    const active = Array.from(this.connections.values());
    return active.length > 0 ? active[0] : undefined;
  }

  /**
   * Get all active bridges
   */
  public getAllBridges(): LocalBridgeConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Aggregate tools across all connected bridges
   */
  public getAggregatedTools(): McpTool[] {
    const aggregated: McpTool[] = [];
    for (const bridge of this.connections.values()) {
      bridge.tools.forEach((t) => {
        aggregated.push({
          ...t,
          serverName: t.serverName || bridge.bridgeId,
        });
      });
    }
    return aggregated;
  }

  /**
   * Aggregate resources across all connected bridges
   */
  public getAggregatedResources(): McpResource[] {
    const aggregated: McpResource[] = [];
    for (const bridge of this.connections.values()) {
      (bridge.resources || []).forEach((r) => {
        aggregated.push({
          ...r,
          serverName: r.serverName || bridge.bridgeId,
        });
      });
    }
    return aggregated;
  }

  /**
   * Aggregate prompts across all connected bridges
   */
  public getAggregatedPrompts(): McpPrompt[] {
    const aggregated: McpPrompt[] = [];
    for (const bridge of this.connections.values()) {
      (bridge.prompts || []).forEach((p) => {
        aggregated.push({
          ...p,
          serverName: p.serverName || bridge.bridgeId,
        });
      });
    }
    return aggregated;
  }

  /**
   * Update tools list for a connection
   */
  public updateBridgeTools(bridgeId: string, tools: McpTool[]): void {
    const conn = this.getBridge(bridgeId);
    if (conn) {
      conn.tools = tools;
      conn.lastSeen = new Date();
      console.log(`[BridgeManager] Updated tools for bridge ${bridgeId}: ${tools.length} tools`);
    }
  }

  /**
   * Forward a JSON-RPC request to a Local MCP Bridge and wait for correlated response
   */
  public async forwardRequest(
    request: JsonRpcRequest,
    targetBridgeId?: string,
    timeoutMs = 30000
  ): Promise<JsonRpcResponse> {
    const targetBridge = this.getBridge(targetBridgeId);
    if (!targetBridge) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32001,
          message: targetBridgeId
            ? `No active bridge connection found with bridgeId '${targetBridgeId}'`
            : 'No connected Local MCP Bridge available on Gateway',
        },
      };
    }

    const requestId = request.id ?? `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const forwardedMsg: GatewayWsMessage = {
      type: 'request',
      requestId,
      bridgeId: targetBridge.bridgeId,
      payload: { ...request, id: requestId },
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
