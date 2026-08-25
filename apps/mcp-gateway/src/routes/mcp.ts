import { Router, Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import { BridgeManager } from '../services/bridge-manager';
import { createSdkMcpServer } from '../services/mcp-server';
import { JsonRpcRequest } from '../types';

export function createMcpRouter(bridgeManager: BridgeManager): Router {
  const router = Router();

  // Active SSE Transports map by sessionId
  const sseTransports = new Map<string, SSEServerTransport>();
  const streamableTransports = new Map<string, StreamableHTTPServerTransport>();

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
        workspaceId: b.workspaceId,
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
        workspaceId: b.workspaceId,
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

    const workspaceId =
      (req.query.workspaceId as string) || (req.headers['x-workspace-id'] as string);
    const sdkMcpServer = createSdkMcpServer(bridgeManager, workspaceId);
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
        const workspaceId =
          (req.query.workspaceId as string) || (req.headers['x-workspace-id'] as string);
        const response = await bridgeManager.forwardRequest(jsonRpcReq, undefined, 30000, workspaceId);
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
   * Streamable HTTP MCP Endpoint (POST/GET/DELETE /mcp)
   */
  router.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport = sessionId ? streamableTransports.get(sessionId) : undefined;

    if (!transport) {
      const jsonRpcReq = req.body as JsonRpcRequest;
      const workspaceId =
        (req.query.workspaceId as string) || (req.headers['x-workspace-id'] as string);

      if (jsonRpcReq?.method !== 'initialize') {
        const bridgeId = (req.query.bridgeId as string) || (req.headers['x-bridge-id'] as string);

        if (jsonRpcReq?.jsonrpc === '2.0' && jsonRpcReq.method === 'tools/list' && !bridgeId) {
          res.json({
            jsonrpc: '2.0',
            id: jsonRpcReq.id,
            result: { tools: bridgeManager.getAggregatedTools(workspaceId) },
          });
          return;
        }

        if (jsonRpcReq?.jsonrpc === '2.0' && jsonRpcReq.method) {
          try {
            const response = await bridgeManager.forwardRequest(
              jsonRpcReq,
              bridgeId,
              30000,
              workspaceId
            );
            res.json(response);
          } catch (err: any) {
            res.status(500).json({
              jsonrpc: '2.0',
              id: jsonRpcReq.id,
              error: { code: -32603, message: `Internal Gateway Error: ${err?.message || err}` },
            });
          }
          return;
        }
      }

      if (!jsonRpcReq || jsonRpcReq.jsonrpc !== '2.0' || jsonRpcReq.method !== 'initialize') {
        res.status(400).json({
          jsonrpc: '2.0',
          id: jsonRpcReq?.id || null,
          error: { code: -32600, message: 'Invalid Request' },
        });
        return;
      }

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          streamableTransports.set(newSessionId, transport!);
        },
      });

      transport.onclose = () => {
        if (transport?.sessionId) {
          streamableTransports.delete(transport.sessionId);
        }
      };

      const sdkMcpServer = createSdkMcpServer(bridgeManager, workspaceId);
      await sdkMcpServer.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  router.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const transport = sessionId ? streamableTransports.get(sessionId) : undefined;

    if (!transport) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: 'Missing or invalid MCP session ID' },
      });
      return;
    }

    await transport.handleRequest(req, res);
  });

  router.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const transport = sessionId ? streamableTransports.get(sessionId) : undefined;

    if (!transport) {
      res.status(404).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32001, message: 'Session not found' },
      });
      return;
    }

    await transport.handleRequest(req, res);
    streamableTransports.delete(sessionId!);
  });

  return router;
}
