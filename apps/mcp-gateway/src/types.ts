import WebSocket from 'ws';

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

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  serverName?: string;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  serverName?: string;
}

export interface BridgeRegistration {
  type: 'register';
  bridgeId: string;
  clientName?: string;
  tools?: McpTool[];
  resources?: McpResource[];
  prompts?: McpPrompt[];
}

export interface GatewayWsMessage {
  type: 'request' | 'response' | 'register' | 'tools_update' | 'ping' | 'pong';
  requestId?: string | number;
  bridgeId?: string;
  payload?: any;
}

export interface LocalBridgeConnection {
  connectionId: string;
  bridgeId: string;
  ws: WebSocket;
  connectedAt: Date;
  clientName?: string;
  tools: McpTool[];
  resources?: McpResource[];
  prompts?: McpPrompt[];
  lastSeen: Date;
}

export interface SseSession {
  sessionId: string;
  res: any; // Express Response
  created: Date;
}
