import http from 'http';
import { startGateway } from '../apps/mcp-gateway/src/main';
import { LocalMcpProcessManager } from '../apps/local-mcp-bridge/src/services/mcp-process';
import { GatewayClient } from '../apps/local-mcp-bridge/src/services/gateway-client';

async function sendHttpRequest(
  port: number,
  path: string,
  method = 'GET',
  body?: any,
  headers: Record<string, string> = {}
): Promise<any> {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        host: 'localhost',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataString),
          ...headers,
        },
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              data: JSON.parse(responseBody),
            });
          } catch {
            resolve({
              status: res.statusCode,
              data: responseBody,
            });
          }
        });
      }
    );

    req.on('error', reject);
    if (dataString) {
      req.write(dataString);
    }
    req.end();
  });
}

async function runE2eTest() {
  console.log('=== STARTING MCP GATEWAY & BRIDGE E2E TEST ===');

  const httpPort = 9767;
  const wsPort = 9768;

  // 1. Start MCP Gateway
  console.log('\nStep 1: Starting Gateway...');
  const { server, wss, bridgeManager } = startGateway(httpPort, wsPort);
  await new Promise((r) => setTimeout(r, 1000));

  // 2. Start Mock / Stdio Local MCP Process Manager & Gateway Client
  console.log('\nStep 2: Starting Local MCP Bridge & local MCP server...');
  const processManager = new LocalMcpProcessManager();

  // Use a minimal node script as stdio local MCP server for test predictability
  const mockServerConfig = {
    testServer: {
      command: 'node',
      args: [
        '-e',
        `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
rl.on('line', (line) => {
  try {
    const req = JSON.parse(line);
    if (req.method === 'initialize') {
      console.log(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { capabilities: {} } }));
    } else if (req.method === 'tools/list') {
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          tools: [{
            name: 'read_file',
            description: 'Read contents of a local file',
            inputSchema: { type: 'object', properties: { path: { type: 'string' } } }
          }]
        }
      }));
    } else if (req.method === 'tools/call') {
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          content: [{ type: 'text', text: 'E2E_FILE_CONTENT_SUCCESS' }]
        }
      }));
    }
  } catch(e) {}
});
        `,
      ],
    },
  };

  const tools = await processManager.initializeServers(mockServerConfig);
  console.log('Discovered tools on bridge startup:', tools);

  const gatewayClient = new GatewayClient(
    {
      gatewayUrl: `ws://localhost:${wsPort}`,
      bridgeId: 'e2e-test-bridge',
      clientName: 'E2E Test Bridge',
      mcpServers: mockServerConfig,
    },
    processManager
  );

  gatewayClient.connect(tools);

  // Wait for WS registration
  await new Promise((r) => setTimeout(r, 1500));

  // 3. Test Health Endpoint
  console.log('\nStep 3: Testing Gateway /health endpoint...');
  const healthResp = await sendHttpRequest(httpPort, '/health');
  console.log('Health response:', healthResp.data);

  if (healthResp.data.activeBridgesCount !== 1) {
    throw new Error(`Expected 1 active bridge in health, got ${healthResp.data.activeBridgesCount}`);
  }

  // 4. Test MCP tools/list
  console.log('\nStep 4: Requesting tools/list via Gateway POST /mcp...');
  const listResp = await sendHttpRequest(httpPort, '/mcp', 'POST', {
    jsonrpc: '2.0',
    id: 'req-list-1',
    method: 'tools/list',
  });

  console.log('tools/list response:', JSON.stringify(listResp.data, null, 2));

  if (!listResp.data.result?.tools?.some((t: any) => t.name === 'read_file')) {
    throw new Error('tools/list failed: read_file tool not found in response');
  }

  // 5. Test MCP tools/call
  console.log('\nStep 5: Invoking tools/call (read_file) via Gateway POST /mcp...');
  const callResp = await sendHttpRequest(httpPort, '/mcp', 'POST', {
    jsonrpc: '2.0',
    id: 'req-call-1',
    method: 'tools/call',
    params: {
      name: 'read_file',
      arguments: {
        path: '/test/path/package.json',
      },
    },
  });

  console.log('tools/call response:', JSON.stringify(callResp.data, null, 2));

  if (callResp.data.result?.content?.[0]?.text !== 'E2E_FILE_CONTENT_SUCCESS') {
    throw new Error('tools/call failed: expected content E2E_FILE_CONTENT_SUCCESS');
  }

  console.log('\n✅ ALL E2E VERIFICATION CHECKS PASSED SUCCESSFULLY!');

  // Cleanup
  gatewayClient.disconnect();
  processManager.stopAll();
  wss.close();
  server.close();
  process.exit(0);
}

runE2eTest().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
