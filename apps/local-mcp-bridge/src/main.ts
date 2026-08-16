import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { BridgeConfig } from './types';
import { LocalMcpProcessManager } from './services/mcp-process';
import { GatewayClient } from './services/gateway-client';

dotenv.config();

export async function startBridge(configPath?: string) {
  const resolvedConfigPath =
    configPath || process.env.BRIDGE_CONFIG_PATH || path.resolve(process.cwd(), 'mcp-config.json');

  let config: BridgeConfig;

  if (fs.existsSync(resolvedConfigPath)) {
    console.log(`[Bridge Main] Loading config from ${resolvedConfigPath}`);
    const raw = fs.readFileSync(resolvedConfigPath, 'utf-8');
    config = JSON.parse(raw);
  } else {
    console.log(`[Bridge Main] No config file found at ${resolvedConfigPath}. Using default fallback configuration.`);
    config = {
      gatewayUrl: process.env.GATEWAY_WS_URL || 'ws://localhost:8768',
      bridgeId: process.env.BRIDGE_ID || 'local-mac-bridge',
      clientName: 'Local MCP Bridge (Default)',
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
        },
      },
    };
  }

  const processManager = new LocalMcpProcessManager();
  const gatewayClient = new GatewayClient(config, processManager);

  // Initialize local MCP servers
  console.log('[Bridge Main] Initializing local MCP processes...');
  const tools = await processManager.initializeServers(config.mcpServers || {});

  // Connect outbound to Gateway
  gatewayClient.connect(tools);

  // Handle graceful shutdown
  const shutdown = () => {
    console.log('\n[Bridge Main] Shutting down Local MCP Bridge...');
    gatewayClient.disconnect();
    processManager.stopAll();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { processManager, gatewayClient };
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
Usage: local-mcp-bridge [options]

Options:
  --config <path>   Path to JSON configuration file (default: ./mcp-config.json)
  --help, -h        Show this help message
`);
    process.exit(0);
  }

  const configPath = getArgValue('--config');
  startBridge(configPath ? configPath : undefined).catch((err) => {
    console.error('[Bridge Main] Critical failure during startup:', err);
    process.exit(1);
  });
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
