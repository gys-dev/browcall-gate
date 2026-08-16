import { spawn, ChildProcess } from 'child_process';
import readline from 'readline';
import { McpServerConfig, McpTool, JsonRpcRequest, JsonRpcResponse } from '../types';

interface ManagedMcpServer {
  serverName: string;
  config: McpServerConfig;
  process: ChildProcess;
  readline: readline.Interface;
  pendingRequests: Map<
    string | number,
    {
      resolve: (res: JsonRpcResponse) => void;
      reject: (err: Error) => void;
    }
  >;
  tools: McpTool[];
}

export class LocalMcpProcessManager {
  private servers = new Map<string, ManagedMcpServer>();

  /**
   * Start and initialize local MCP servers configured in config
   */
  public async initializeServers(
    mcpServersConfig: Record<string, McpServerConfig>
  ): Promise<McpTool[]> {
    const allTools: McpTool[] = [];

    for (const [serverName, config] of Object.entries(mcpServersConfig)) {
      try {
        const managed = this.startServerProcess(serverName, config);
        this.servers.set(serverName, managed);

        // Perform standard MCP initialization handshake
        await this.sendInitializeHandshake(managed);

        // Query available tools list from local server
        const tools = await this.fetchToolsList(managed);
        managed.tools = tools;
        tools.forEach((t) => allTools.push(t));

        console.log(
          `[LocalMcpProcessManager] Local server '${serverName}' started. Tools found: ${tools.length}`
        );
      } catch (err: any) {
        console.error(
          `[LocalMcpProcessManager] Failed to start local server '${serverName}':`,
          err?.message || err
        );
      }
    }

    return allTools;
  }

  /**
   * Start stdio child process for a given server
   */
  private startServerProcess(
    serverName: string,
    config: McpServerConfig
  ): ManagedMcpServer {
    const childEnv = { ...process.env, ...(config.env || {}) };
    const child = spawn(config.command, config.args || [], {
      env: childEnv,
      cwd: config.cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const pendingRequests = new Map<
      string | number,
      { resolve: (res: JsonRpcResponse) => void; reject: (err: Error) => void }
    >();

    const rl = readline.createInterface({
      input: child.stdout!,
      terminal: false,
    });

    rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const parsed = JSON.parse(trimmed) as JsonRpcResponse;
        if (parsed.id !== undefined && pendingRequests.has(parsed.id)) {
          const handler = pendingRequests.get(parsed.id)!;
          pendingRequests.delete(parsed.id);
          handler.resolve(parsed);
        }
      } catch (err) {
        // Log non-JSON stdout debug lines
        console.log(`[Local MCP Server output (${serverName})]: ${trimmed}`);
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      console.warn(`[Local MCP Server stderr (${serverName})]: ${chunk.toString().trim()}`);
    });

    child.on('exit', (code) => {
      console.warn(`[Local MCP Server (${serverName})] Process exited with code ${code}`);
    });

    return {
      serverName,
      config,
      process: child,
      readline: rl,
      pendingRequests,
      tools: [],
    };
  }

  /**
   * Send stdio JSON-RPC request to a local server
   */
  private sendRequest(
    server: ManagedMcpServer,
    method: string,
    params?: any,
    timeoutMs = 15000
  ): Promise<JsonRpcResponse> {
    const requestId = `bridge-req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const jsonRpcMsg: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        server.pendingRequests.delete(requestId);
        resolve({
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32000,
            message: `Request '${method}' to local server '${server.serverName}' timed out after ${timeoutMs}ms`,
          },
        });
      }, timeoutMs);

      server.pendingRequests.set(requestId, {
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      try {
        server.process.stdin?.write(JSON.stringify(jsonRpcMsg) + '\n');
      } catch (err: any) {
        clearTimeout(timer);
        server.pendingRequests.delete(requestId);
        resolve({
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32002,
            message: `Failed to write to stdin of local server '${server.serverName}': ${err?.message || err}`,
          },
        });
      }
    });
  }

  /**
   * Perform initial MCP handshake
   */
  private async sendInitializeHandshake(server: ManagedMcpServer): Promise<void> {
    try {
      const initResp = await this.sendRequest(server, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'Local MCP Bridge',
          version: '1.0.0',
        },
      });

      // Send initialized notification if required
      if (!initResp.error) {
        const notification = {
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        };
        server.process.stdin?.write(JSON.stringify(notification) + '\n');
      }
    } catch {
      // Ignore initial failure if server is simple JSON-RPC
    }
  }

  /**
   * Query tools list from local MCP server
   */
  private async fetchToolsList(server: ManagedMcpServer): Promise<McpTool[]> {
    try {
      const resp = await this.sendRequest(server, 'tools/list');
      if (resp.result && Array.isArray(resp.result.tools)) {
        return resp.result.tools.map((t: any) => ({
          ...t,
          serverName: server.serverName,
        }));
      }
    } catch (err: any) {
      console.warn(`[LocalMcpProcessManager] Could not fetch tools list from ${server.serverName}:`, err);
    }
    return [];
  }

  /**
   * Route incoming JSON-RPC request from Gateway to target local MCP server
   */
  public async handleForwardedRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    // If request is tools/list, aggregate from all managed servers
    if (request.method === 'tools/list') {
      const allTools: McpTool[] = [];
      for (const server of this.servers.values()) {
        const tools = await this.fetchToolsList(server);
        tools.forEach((t) => allTools.push(t));
      }
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: { tools: allTools },
      };
    }

    // For tool calls or other methods, find the appropriate server
    const targetToolName = request.params?.name;
    let targetServer: ManagedMcpServer | undefined;

    if (targetToolName) {
      for (const server of this.servers.values()) {
        if (server.tools.some((t) => t.name === targetToolName)) {
          targetServer = server;
          break;
        }
      }
    }

    // If no target server found by tool name, fallback to first active server
    if (!targetServer) {
      const first = Array.from(this.servers.values())[0];
      targetServer = first;
    }

    if (!targetServer) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32601,
          message: 'No local MCP server process running on bridge to handle request',
        },
      };
    }

    return this.sendRequest(targetServer, request.method, request.params);
  }

  /**
   * Stop all local processes
   */
  public stopAll(): void {
    for (const server of this.servers.values()) {
      try {
        server.readline.close();
        server.process.kill();
      } catch {
        // ignore shutdown error
      }
    }
    this.servers.clear();
  }
}
