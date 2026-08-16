import { Router, Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { BridgeManager } from '../services/bridge-manager';
import { createSdkMcpServer } from '../services/mcp-server';
import { JsonRpcRequest } from '../types';

export function createMcpRouter(bridgeManager: BridgeManager): Router {
  const router = Router();

  // Active SSE Transports map by sessionId
  const sseTransports = new Map<string, SSEServerTransport>();

  /**
   * Health Check Endpoint
   */
  router.get('/health', (req: Request, res: Response) => {
    const bridges = bridgeManager.getAllBridges();
    res.json({
      status: 'ok',
      service: 'mcp-gateway',
      activeBridgesCount: bridges.length,
      bridges: bridges.map((b) => ({
        bridgeId: b.bridgeId,
        clientName: b.clientName,
        connectedAt: b.connectedAt,
        toolsCount: b.tools.length,
      })),
    });
  });

  /**
   * Get Active Bridges & Aggregated Tool List
   */
  router.get('/bridges', (req: Request, res: Response) => {
    const bridges = bridgeManager.getAllBridges();
    const aggregatedTools = bridgeManager.getAggregatedTools();

    res.json({
      count: bridges.length,
      bridges: bridges.map((b) => ({
        connectionId: b.connectionId,
        bridgeId: b.bridgeId,
        clientName: b.clientName,
        connectedAt: b.connectedAt,
        tools: b.tools,
      })),
      aggregatedTools,
    });
  });

  /**
   * Official MCP Server-Sent Events (SSE) Endpoint
   * Using @modelcontextprotocol/sdk SSEServerTransport
   */
  router.get('/sse', async (req: Request, res: Response) => {
    console.log('[Gateway SSE] New SSE client connection initiated');
    res.setHeader('X-Accel-Buffering', 'no');

    const messagesEndpoint = `${req.baseUrl || ''}/messages`;
    const transport = new SSEServerTransport(messagesEndpoint, res);
    sseTransports.set(transport.sessionId, transport);

    transport.onclose = () => {
      console.log(`[Gateway SSE] SSE session closed: ${transport.sessionId}`);
      sseTransports.delete(transport.sessionId);
    };

    const sdkMcpServer = createSdkMcpServer(bridgeManager);
    await sdkMcpServer.connect(transport);
  });

  /**
   * Messages Endpoint for SSE Transport
   */
  router.post('/messages', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const transport = sessionId ? sseTransports.get(sessionId) : undefined;

    if (transport) {
      await transport.handlePostMessage(req, res, req.body);
      return;
    }

    // Fallback: handle direct JSON-RPC POST
    const jsonRpcReq = req.body as JsonRpcRequest;
    if (jsonRpcReq && jsonRpcReq.jsonrpc === '2.0' && jsonRpcReq.method) {
      try {
        const response = await bridgeManager.forwardRequest(jsonRpcReq);
        res.json(response);
      } catch (err: any) {
        res.status(500).json({
          jsonrpc: '2.0',
          id: jsonRpcReq.id,
          error: { code: -32603, message: err?.message || err },
        });
      }
      return;
    }

    res.status(400).send('Session not found or invalid payload');
  });

  /**
   * Main Streamable HTTP MCP Endpoint (POST /mcp)
   */
  router.post('/mcp', async (req: Request, res: Response) => {
    const jsonRpcReq = req.body as JsonRpcRequest;

    if (!jsonRpcReq || jsonRpcReq.jsonrpc !== '2.0' || !jsonRpcReq.method) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: jsonRpcReq?.id || null,
        error: {
          code: -32600,
          message: 'Invalid Request: Must be a valid JSON-RPC 2.0 object with method',
        },
      });
      return;
    }

    const bridgeId = (req.query.bridgeId as string) || (req.headers['x-bridge-id'] as string);

    // Protocol Handshake
    if (jsonRpcReq.method === 'initialize') {
      res.json({
        jsonrpc: '2.0',
        id: jsonRpcReq.id,
        result: {
          protocolVersion: '2026-07-28',
          capabilities: {
            tools: { listChanged: true },
            resources: { subscribe: true, listChanged: true },
            prompts: { listChanged: true },
          },
          serverInfo: {
            name: 'MCP Gateway',
            version: '1.0.0',
          },
        },
      });
      return;
    }

    // Fast-path tool list
    if (jsonRpcReq.method === 'tools/list' && !bridgeId) {
      res.json({
        jsonrpc: '2.0',
        id: jsonRpcReq.id,
        result: {
          tools: bridgeManager.getAggregatedTools(),
        },
      });
      return;
    }

    // Forward request to Local MCP Bridge over WebSocket
    try {
      const response = await bridgeManager.forwardRequest(jsonRpcReq, bridgeId);
      res.json(response);
    } catch (err: any) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: jsonRpcReq.id,
        error: {
          code: -32603,
          message: `Internal Gateway Error: ${err?.message || err}`,
        },
      });
    }
  });

  return router;
}
