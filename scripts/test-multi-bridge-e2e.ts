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

function createMockServerCode(bridgeTag: string, toolNames: string[]) {
  const toolsArray = toolNames.map((name) => ({
    name,
    description: `Tool ${name} from ${bridgeTag}`,
    inputSchema: { type: 'object', properties: {} },
  }));

  return `
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
        result: { tools: ${JSON.stringify(toolsArray)} }
      }));
    } else if (req.method === 'tools/call') {
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          content: [{ type: 'text', text: 'EXECUTED_BY_' + ${JSON.stringify(bridgeTag)} + '_TOOL_' + req.params.name }]
        }
      }));
    }
  } catch(e) {}
});
`;
}

async function runMultiBridgeTest() {
  console.log('=== STARTING MULTI-BRIDGE CONCURRENCY & SMART ROUTING E2E TEST ===');

  const httpPort = 9867;
  const wsPort = 9868;

  // 1. Start Gateway
  console.log('\nStep 1: Starting Gateway server...');
  const { server, wss } = startGateway(httpPort, wsPort);
  await new Promise((r) => setTimeout(r, 1000));

  // 2. Start Bridge Mighty Note Backend
  console.log('\nStep 2: Starting Bridge Mighty Note Backend (mighty_note_backend)...');
  const pmAlpha = new LocalMcpProcessManager();
  const configAlpha = {
    srv: {
      command: 'node',
      args: ['-e', createMockServerCode('MIGHTY_NOTE', ['read_file', 'mighty_action'])],
    },
  };
  const toolsAlpha = await pmAlpha.initializeServers(configAlpha);
  const clientAlpha = new GatewayClient(
    {
      gatewayUrl: `ws://localhost:${wsPort}`,
      bridgeId: 'mighty_note_backend',
      workspaceId: 'mighty_note_backend',
      clientName: 'mighty_note_backend Bridge',
      mcpServers: configAlpha,
    },
    pmAlpha
  );
  clientAlpha.connect(toolsAlpha);

  // 3. Start Bridge GPT Inner Call
  console.log('\nStep 3: Starting Bridge GPT Inner Call (gpt_inner_call)...');
  const pmBeta = new LocalMcpProcessManager();
  const configBeta = {
    srv: {
      command: 'node',
      args: ['-e', createMockServerCode('GPT_INNER', ['read_file', 'gpt_action'])],
    },
  };
  const toolsBeta = await pmBeta.initializeServers(configBeta);
  const clientBeta = new GatewayClient(
    {
      gatewayUrl: `ws://localhost:${wsPort}`,
      bridgeId: 'gpt_inner_call',
      workspaceId: 'gpt_inner_call',
      clientName: 'gpt_inner_call Bridge',
      mcpServers: configBeta,
    },
    pmBeta
  );
  clientBeta.connect(toolsBeta);

  // 4. Start Bridge Gamma (using same bridgeId as mighty_note_backend to test duplicate instance concurrency)
  console.log('\nStep 4: Starting Bridge Gamma (mighty_note_backend duplicate instance)...');
  const pmGamma = new LocalMcpProcessManager();
  const configGamma = {
    srv: {
      command: 'node',
      args: ['-e', createMockServerCode('GAMMA', ['gamma_unique_action'])],
    },
  };
  const toolsGamma = await pmGamma.initializeServers(configGamma);
  const clientGamma = new GatewayClient(
    {
      gatewayUrl: `ws://localhost:${wsPort}`,
      bridgeId: 'mighty_note_backend',
      workspaceId: 'mighty_note_backend',
      clientName: 'Mighty Note Second Instance',
      mcpServers: configGamma,
    },
    pmGamma
  );
  clientGamma.connect(toolsGamma);

  // Wait for WS registrations
  await new Promise((r) => setTimeout(r, 1500));

  // 5. Check Health - verify ALL 3 bridges are active (none rejected!)
  console.log('\nStep 5: Verifying /health endpoint for 3 active bridge connections...');
  const healthResp = await sendHttpRequest(httpPort, '/health');
  console.log('Health Response:', JSON.stringify(healthResp.data, null, 2));

  if (healthResp.data.activeBridgesCount !== 3) {
    throw new Error(
      `Expected 3 active bridges in health, but got ${healthResp.data.activeBridgesCount}. An old bridge was rejected!`
    );
  }
  console.log('✅ PASS: All 3 bridges connected concurrently without rejecting old sockets!');

  // 6. Test Aggregated Tools
  console.log('\nStep 6: Requesting aggregated tools/list...');
  const listResp = await sendHttpRequest(httpPort, '/mcp', 'POST', {
    jsonrpc: '2.0',
    id: 'req-list-multi',
    method: 'tools/list',
  });

  const toolsList: any[] = listResp.data.result?.tools || [];
  console.log('Aggregated tools count:', toolsList.length);
  console.log('Tool names:', toolsList.map((t) => t.name));

  const hasMightyAction = toolsList.some((t) => t.name === 'mighty_action');
  const hasGptAction = toolsList.some((t) => t.name === 'gpt_action');
  const hasGammaAction = toolsList.some((t) => t.name === 'gamma_unique_action');
  const hasPrefixedMightyRead = toolsList.some((t) => t.name === 'mighty_note_backend__read_file');
  const hasPrefixedGptRead = toolsList.some((t) => t.name === 'gpt_inner_call__read_file');

  if (!hasMightyAction || !hasGptAction || !hasGammaAction || !hasPrefixedMightyRead || !hasPrefixedGptRead) {
    throw new Error('Tool aggregation/disambiguation failed! Missing expected project-prefixed tool names (mighty_note_backend__read_file / gpt_inner_call__read_file).');
  }
  console.log('✅ PASS: Tools merged correctly per project/bridge with collision disambiguation (mighty_note_backend__read_file and gpt_inner_call__read_file)!');

  // 7. Test Smart Tool Routing to Mighty Note
  console.log('\nStep 7: Executing tool mighty_action (wise forwarding to Mighty Note)...');
  const callAlpha = await sendHttpRequest(httpPort, '/mcp', 'POST', {
    jsonrpc: '2.0',
    id: 'req-call-alpha',
    method: 'tools/call',
    params: { name: 'mighty_action', arguments: {} },
  });
  console.log('Mighty Note Call Result:', callAlpha.data.result);
  if (!callAlpha.data.result?.content?.[0]?.text?.includes('EXECUTED_BY_MIGHTY_NOTE')) {
    throw new Error(`Routing failed for mighty_action: ${JSON.stringify(callAlpha.data)}`);
  }
  console.log('✅ PASS: mighty_action routed to Bridge Mighty Note Backend!');

  // 8. Test Smart Tool Routing to GPT Inner Call
  console.log('\nStep 8: Executing tool gpt_action (wise forwarding to GPT Inner Call)...');
  const callBeta = await sendHttpRequest(httpPort, '/mcp', 'POST', {
    jsonrpc: '2.0',
    id: 'req-call-beta',
    method: 'tools/call',
    params: { name: 'gpt_action', arguments: {} },
  });
  console.log('GPT Inner Call Result:', callBeta.data.result);
  if (!callBeta.data.result?.content?.[0]?.text?.includes('EXECUTED_BY_GPT_INNER')) {
    throw new Error(`Routing failed for gpt_action: ${JSON.stringify(callBeta.data)}`);
  }
  console.log('✅ PASS: gpt_action routed to Bridge GPT Inner Call!');

  // 9. Test Smart Prefixed Tool Routing to GPT Inner Call (gpt_inner_call__read_file)
  console.log('\nStep 9: Executing gpt_inner_call__read_file (wise forwarding via project prefix)...');
  const callPrefixedBeta = await sendHttpRequest(httpPort, '/mcp', 'POST', {
    jsonrpc: '2.0',
    id: 'req-call-prefixed-beta',
    method: 'tools/call',
    params: { name: 'gpt_inner_call__read_file', arguments: {} },
  });
  console.log('Prefixed GPT Inner Read Result:', callPrefixedBeta.data.result);
  if (!callPrefixedBeta.data.result?.content?.[0]?.text?.includes('EXECUTED_BY_GPT_INNER_TOOL_read_file')) {
    throw new Error(`Routing failed for gpt_inner_call__read_file: ${JSON.stringify(callPrefixedBeta.data)}`);
  }
  console.log('✅ PASS: gpt_inner_call__read_file prefix stripped and routed to Bridge GPT Inner Call!');

  // 10. Test explicit workspace routing to Mighty Note Backend
  console.log('\nStep 10: Executing gamma_unique_action with mighty_note_backend workspace routing...');
  const callWorkspaceAlpha = await sendHttpRequest(
    httpPort,
    '/mcp?workspaceId=mighty_note_backend',
    'POST',
    {
      jsonrpc: '2.0',
      id: 'req-call-workspace-alpha',
      method: 'tools/call',
      params: { name: 'gamma_unique_action', arguments: {} },
    }
  );
  console.log('Workspace Mighty Note Call Result:', callWorkspaceAlpha.data.result);
  if (!callWorkspaceAlpha.data.result?.content?.[0]?.text?.includes('EXECUTED_BY_GAMMA')) {
    throw new Error(
      `Workspace routing failed for gamma_unique_action: ${JSON.stringify(callWorkspaceAlpha.data)}`
    );
  }
  console.log('✅ PASS: mighty_note_backend workspace resolved to the correct bridge connection!');

  console.log('\nALL MULTI-BRIDGE E2E VERIFICATION TESTS PASSED SUCCESSFULLY!');

  // Cleanup
  clientAlpha.disconnect();
  clientBeta.disconnect();
  clientGamma.disconnect();
  pmAlpha.stopAll();
  pmBeta.stopAll();
  pmGamma.stopAll();
  wss.close();
  server.close();
  process.exit(0);
}

runMultiBridgeTest().catch((err) => {
  console.error('\n❌ MULTI-BRIDGE E2E TEST FAILED:', err);
  process.exit(1);
});
