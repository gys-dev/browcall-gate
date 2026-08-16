import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  PingRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { BridgeManager } from './bridge-manager';
import { JsonRpcRequest } from '../types';

export function createSdkMcpServer(bridgeManager: BridgeManager): Server {
  const server = new Server(
    {
      name: 'mcp-gateway',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true },
      },
    }
  );

  // 1. List Tools Handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = bridgeManager.getAggregatedTools();
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
      })),
    };
  });

  // 2. Call Tool Handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const jsonRpcReq: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: `sdk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      method: 'tools/call',
      params: { name, arguments: args || {} },
    };

    const response = await bridgeManager.forwardRequest(jsonRpcReq);
    if (response.error) {
      throw new Error(`Tool call failed: ${response.error.message}`);
    }
    return response.result;
  });

  // 3. List Resources Handler
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = bridgeManager.getAggregatedResources();
    return {
      resources: resources.map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      })),
    };
  });

  // 4. Read Resource Handler
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const jsonRpcReq: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: `sdk-${Date.now()}`,
      method: 'resources/read',
      params: request.params,
    };
    const response = await bridgeManager.forwardRequest(jsonRpcReq);
    if (response.error) {
      throw new Error(`Resource read failed: ${response.error.message}`);
    }
    return response.result;
  });

  // 5. List Prompts Handler
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const prompts = bridgeManager.getAggregatedPrompts();
    return {
      prompts: prompts.map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      })),
    };
  });

  // 6. Get Prompt Handler
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const jsonRpcReq: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: `sdk-${Date.now()}`,
      method: 'prompts/get',
      params: request.params,
    };
    const response = await bridgeManager.forwardRequest(jsonRpcReq);
    if (response.error) {
      throw new Error(`Prompt get failed: ${response.error.message}`);
    }
    return response.result;
  });

  // 7. Ping Handler
  server.setRequestHandler(PingRequestSchema, async () => {
    return {};
  });

  return server;
}
