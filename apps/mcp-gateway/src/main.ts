import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { BridgeManager } from './services/bridge-manager';
import { createMcpRouter } from './routes/mcp';
import { GatewayWsMessage } from './types';

dotenv.config();

export function startGateway(httpPortArg?: number, wsPortArg?: number) {
  const httpPort =
    httpPortArg || (process.env.GATEWAY_HTTP_PORT ? Number(process.env.GATEWAY_HTTP_PORT) : 8767);
  const wsPort =
    wsPortArg || (process.env.GATEWAY_WS_PORT ? Number(process.env.GATEWAY_WS_PORT) : 8768);

  const bridgeManager = new BridgeManager();

  // Initialize Express HTTP app
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  // Attach MCP routes
  const router = createMcpRouter(bridgeManager);
  app.use(router);

  const server = http.createServer(app);

  // Initialize WebSocket Server
  const wss = new WebSocketServer({ port: wsPort });

  wss.on('connection', (ws: WebSocket) => {
    let registeredConnectionId: string | null = null;
    let bridgeId: string | null = null;

    console.log('[Gateway WS] New WebSocket client connected');

    ws.on('message', (rawMessage: Buffer | string) => {
      try {
        const msg = JSON.parse(rawMessage.toString()) as GatewayWsMessage;

        if (msg.type === 'register') {
          bridgeId = msg.bridgeId || `bridge-${Math.random().toString(36).substring(2, 7)}`;
          const conn = bridgeManager.registerConnection(
            ws,
            bridgeId,
            msg.payload?.clientName,
            msg.payload?.tools || []
          );
          registeredConnectionId = conn.connectionId;

          // Send confirmation back to bridge
          ws.send(
            JSON.stringify({
              type: 'registered',
              bridgeId,
              connectionId: registeredConnectionId,
              status: 'ok',
            })
          );
          return;
        }

        if (msg.type === 'tools_update' && bridgeId) {
          bridgeManager.updateBridgeTools(bridgeId, msg.payload?.tools || []);
          return;
        }

        if (msg.type === 'response') {
          bridgeManager.handleBridgeResponse(msg);
          return;
        }

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }
      } catch (err: any) {
        console.error('[Gateway WS] Error handling message:', err?.message || err);
      }
    });

    ws.on('close', () => {
      if (registeredConnectionId) {
        bridgeManager.removeConnection(registeredConnectionId);
      }
    });

    ws.on('error', (err) => {
      console.error('[Gateway WS] Connection error:', err);
      if (registeredConnectionId) {
        bridgeManager.removeConnection(registeredConnectionId);
      }
    });
  });

  wss.on('listening', () => {
    console.log(`[Gateway WS] WebSocket server listening on ws://localhost:${wsPort}`);
  });

  server.listen(httpPort, () => {
    console.log(`[Gateway HTTP] Server listening on http://localhost:${httpPort}`);
    console.log(`[Gateway HTTP] MCP endpoint available at http://localhost:${httpPort}/mcp`);
  });

  return { server, wss, bridgeManager };
}

function runCLI() {
  const args = process.argv.slice(2);

  const getArgValue = (flag: string) => {
    const index = args.indexOf(flag);
    if (index !== -1 && index + 1 < args.length) {
      return args[index + 1];
    }
    return null;
  };

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: mcp-gateway [options]

Options:
  --port <number>     HTTP port for MCP Gateway (default: 8767)
  --ws-port <number>  WebSocket port for Local MCP Bridges (default: 8768)
  --help, -h          Show this help message
`);
    process.exit(0);
  }

  const port = getArgValue('--port');
  const wsPort = getArgValue('--ws-port');

  startGateway(port ? Number(port) : undefined, wsPort ? Number(wsPort) : undefined);
}

const isMain =
  typeof require !== 'undefined' &&
  (require.main === module ||
    require.main?.filename === __filename ||
    process.argv[1] === __filename ||
    process.argv[1]?.endsWith('main.js') ||
    process.argv[1]?.endsWith('main.ts') ||
    process.argv[1]?.includes('node-with-require-overrides'));

if (isMain) {
  runCLI();
}
