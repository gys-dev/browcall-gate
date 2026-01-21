import express from 'express';
import bodyParser from 'body-parser';
import apiRoutes from './routes/index';
import dotenv from 'dotenv';
import { getWebsocketServerInstance } from './services/websocket';

export function startServer(port?: number) {
  dotenv.config();
  
  const actualPort = port || (process.env.HTTP_PORT ? Number(process.env.HTTP_PORT) : 8766);
  
  // Ensure WebSocket server is initialized with correct env vars
  getWebsocketServerInstance();

  const app = express();

  // app.use(cors());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  app.use(apiRoutes);

  return app.listen(actualPort, () => {
    console.log(
      `Server running at http://localhost:${actualPort}/v1/chat/completions`
    );
  });
}

/**
 * CLI logic
 */
function runCLI() {
  dotenv.config();

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
Usage: gpt-auto-api [options]

Options:
  --http-port <number>  Port for the HTTP server (default: 8766)
  --ws-port <number>    Port for the WebSocket server (default: 8765)
  --node-env <string>   Node atmosphere (default: development)
  --help, -h            Show this help message

Environment variables (can be set in .env):
  HTTP_PORT
  WS_PORT
  NODE_ENV
`);
    process.exit(0);
  }

  const httpPort = getArgValue('--http-port');
  const wsPort = getArgValue('--ws-port');
  const nodeEnv = getArgValue('--node-env');

  if (httpPort) process.env.HTTP_PORT = httpPort;
  if (wsPort) process.env.WS_PORT = wsPort;
  if (nodeEnv) process.env.NODE_ENV = nodeEnv;

  console.log('Starting gpt-auto-api with:');
  console.log(`  HTTP_PORT: ${process.env.HTTP_PORT || 8766}`);
  console.log(`  WS_PORT:   ${process.env.WS_PORT || 8765}`);
  console.log(`  NODE_ENV:  ${process.env.NODE_ENV || 'development'}`);

  try {
    startServer(httpPort ? Number(httpPort) : undefined);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Check if this module is being run directly
const isMain = typeof require !== 'undefined' && (
  require.main === module || 
  require.main?.filename === __filename ||
  process.argv[1] === __filename ||
  process.argv[1]?.endsWith('main.js') ||
  process.argv[1]?.endsWith('main.ts') ||
  process.argv[1]?.includes('node-with-require-overrides') // Nx executor wrapper
);

if (isMain) {
  runCLI();
}
