export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface BridgeConfig {
  gatewayUrl: string;
  bridgeId: string;
  workspaceId?: string;
  clientName?: string;
  mcpServers: Record<string, McpServerConfig>;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, any>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
  serverName?: string;
}

export interface GatewayWsMessage {
  type: 'request' | 'response' | 'register' | 'tools_update' | 'ping' | 'pong';
  requestId?: string | number;
  bridgeId?: string;
  payload?: any;
}
