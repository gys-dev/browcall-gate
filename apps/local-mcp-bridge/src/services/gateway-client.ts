import WebSocket from 'ws';
import { BridgeConfig, GatewayWsMessage, McpTool } from '../types';
import { LocalMcpProcessManager } from './mcp-process';

export class GatewayClient {
  private ws: WebSocket | null = null;
  private config: BridgeConfig;
  private processManager: LocalMcpProcessManager;
  private tools: McpTool[] = [];
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config: BridgeConfig, processManager: LocalMcpProcessManager) {
    this.config = config;
    this.processManager = processManager;
  }

  /**
   * Connect outbound to Gateway WebSocket
   */
  public connect(tools: McpTool[]): void {
    this.tools = tools;
    this.initWebSocket();
  }

  private initWebSocket(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
    }

    console.log(`[GatewayClient] Connecting outbound to Gateway at ${this.config.gatewayUrl}...`);
    this.ws = new WebSocket(this.config.gatewayUrl);

    this.ws.on('open', () => {
      this.isConnected = true;
      console.log(`[GatewayClient] Connected to Gateway! Registering bridgeId '${this.config.bridgeId}'...`);

      // Send register message to Gateway
      const regMsg: GatewayWsMessage = {
        type: 'register',
        bridgeId: this.config.bridgeId,
        payload: {
          clientName: this.config.clientName || 'Local MCP Bridge',
          tools: this.tools,
        },
      };
      this.ws?.send(JSON.stringify(regMsg));
    });

    this.ws.on('message', async (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString()) as GatewayWsMessage;

        if (msg.type === 'request' && msg.requestId && msg.payload) {
          console.log(
            `[GatewayClient] Received forwarded request '${msg.payload.method}' (Req ID: ${msg.requestId})`
          );

          // Handle request with local MCP servers
          const responsePayload = await this.processManager.handleForwardedRequest(msg.payload);

          // Send correlated response back over WebSocket to Gateway
          const responseMsg: GatewayWsMessage = {
            type: 'response',
            requestId: msg.requestId,
            bridgeId: this.config.bridgeId,
            payload: responsePayload,
          };
          this.ws?.send(JSON.stringify(responseMsg));
          return;
        }

        if (msg.type === 'ping') {
          this.ws?.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (err: any) {
        console.error('[GatewayClient] Error processing Gateway message:', err?.message || err);
      }
    });

    this.ws.on('close', () => {
      this.isConnected = false;
      console.warn('[GatewayClient] Disconnected from Gateway. Scheduling reconnect in 5s...');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[GatewayClient] WebSocket connection error:', err.message || err);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.initWebSocket();
    }, 5000);
  }

  public disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
    }
  }
}
