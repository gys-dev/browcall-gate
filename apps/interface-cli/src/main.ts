import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { spawn, ChildProcess, execSync } from 'child_process';
import * as readline from 'readline';

interface ServiceConfig {
  name: string;
  distPath: string;
  description: string;
  defaultEnv: Record<string, string>;
  color: string;
}

const COLOR_RESET = '\x1b[0m';
const COLOR_BOLD = '\x1b[1m';
const COLOR_CYAN = '\x1b[36m';
const COLOR_MAGENTA = '\x1b[35m';
const COLOR_GREEN = '\x1b[32m';
const COLOR_YELLOW = '\x1b[33m';
const COLOR_RED = '\x1b[31m';
const COLOR_BLUE = '\x1b[34m';

const SERVICES: Record<string, ServiceConfig> = {
  'gpt-auto-api': {
    name: 'gpt-auto-api',
    distPath: 'gpt-auto-api/main.js',
    description: 'GPT Auto API server (OpenAI / Anthropic / SSE endpoint)',
    defaultEnv: { PORT: '8766' },
    color: COLOR_CYAN,
  },
  'mcp-gateway': {
    name: 'mcp-gateway',
    distPath: 'mcp-gateway/main.js',
    description: 'MCP Gateway server (Remote MCP proxy & WebSocket router)',
    defaultEnv: { PORT: '8767', WS_PORT: '8768' },
    color: COLOR_MAGENTA,
  },
  'local-mcp-bridge': {
    name: 'local-mcp-bridge',
    distPath: 'local-mcp-bridge/main.js',
    description: 'Local MCP Bridge (Connects local stdio MCP servers to Gateway)',
    defaultEnv: { GATEWAY_URL: 'ws://localhost:8768' },
    color: COLOR_GREEN,
  },
};

interface ActiveService {
  process: ChildProcess;
  config: ServiceConfig;
  startTime: Date;
}

const activeProcesses = new Map<string, ActiveService>();

function resolveServicePath(serviceKey: string): string | null {
  const service = SERVICES[serviceKey];
  if (!service) return null;

  const candidates = [
    // 1. Package-relative embedded path (when installed as npm package)
    path.join(__dirname, 'apps', service.distPath),
    path.join(__dirname, service.distPath),

    // 2. Workspace dist path relative to CWD
    path.resolve(process.cwd(), 'dist/apps', service.distPath),

    // 3. Workspace dist path relative to __dirname
    path.resolve(__dirname, '../../', service.distPath),
    path.resolve(__dirname, '../../../dist/apps', service.distPath),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function locateMcpTemplate(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'mcp-config.sample.json'),
    path.resolve(__dirname, '../../../mcp-config.sample.json'),
    path.resolve(__dirname, '../../mcp-config.sample.json'),
    path.resolve(__dirname, 'mcp-config.sample.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function generateMcpConfigFromTemplate(
  projectDir: string,
  wsPort = '8768',
  outputConfigPath?: string
): string {
  const resolvedProjectDir = path.resolve(projectDir);
  if (!fs.existsSync(resolvedProjectDir)) {
    fs.mkdirSync(resolvedProjectDir, { recursive: true });
  }

  const templatePath = locateMcpTemplate();
  let configData: any;

  if (templatePath) {
    try {
      const raw = fs.readFileSync(templatePath, 'utf8');
      configData = JSON.parse(raw);
      console.log(`${COLOR_CYAN}[MCP Config] Loaded template from ${templatePath}${COLOR_RESET}`);
    } catch (err) {
      console.warn(`${COLOR_YELLOW}[MCP Config] Warning: Could not parse template at ${templatePath}. Using fallback config.${COLOR_RESET}`);
    }
  }

  if (!configData) {
    configData = {
      gatewayUrl: `ws://localhost:${wsPort}`,
      bridgeId: 'mac-local-bridge',
      clientName: 'Local Mac MCP Bridge',
      mcpServers: {
        filesystem: {
          command: 'npm',
          args: ['exec', '--yes', '@modelcontextprotocol/server-filesystem', resolvedProjectDir],
        },
      },
    };
  } else {
    configData.gatewayUrl = `ws://localhost:${wsPort}`;
    if (configData.mcpServers && configData.mcpServers.filesystem) {
      if (Array.isArray(configData.mcpServers.filesystem.args)) {
        const args = configData.mcpServers.filesystem.args;
        const fsPkgIdx = args.indexOf('@modelcontextprotocol/server-filesystem');
        if (fsPkgIdx !== -1 && fsPkgIdx + 1 < args.length) {
          args[fsPkgIdx + 1] = resolvedProjectDir;
        } else {
          args[args.length - 1] = resolvedProjectDir;
        }
      }
    }

    if (configData.mcpServers) {
      for (const [srvName, srvConfig] of Object.entries(configData.mcpServers)) {
        if (srvName === 'filesystem') continue;
        const config = srvConfig as any;
        if (config.command === 'node' && Array.isArray(config.args) && config.args.length > 0) {
          const scriptPath = config.args[0];
          if (path.isAbsolute(scriptPath) && !fs.existsSync(scriptPath)) {
            console.warn(`${COLOR_YELLOW}[MCP Config] Omitting '${srvName}' because script path '${scriptPath}' does not exist on this machine.${COLOR_RESET}`);
            delete configData.mcpServers[srvName];
          }
        }
      }
    }
  }

  const targetFile = outputConfigPath || path.join(resolvedProjectDir, 'mcp-config.json');
  fs.writeFileSync(targetFile, JSON.stringify(configData, null, 2), 'utf8');
  console.log(`${COLOR_GREEN}[MCP Config] Built mcp-config.json at: ${COLOR_BOLD}${targetFile}${COLOR_RESET}`);
  console.log(`  └─ Filesystem target directory: ${COLOR_BOLD}${resolvedProjectDir}${COLOR_RESET}`);
  console.log(`  └─ Gateway WebSocket URL     : ${COLOR_BOLD}${configData.gatewayUrl}${COLOR_RESET}\n`);

  return targetFile;
}

function loadEnvFile(envFilePath: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(envFilePath)) return env;

  try {
    const content = fs.readFileSync(envFilePath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        env[key] = val;
      }
    }
  } catch (err) {
    console.warn(`${COLOR_YELLOW}Warning: Could not parse env file ${envFilePath}:${COLOR_RESET}`, err);
  }
  return env;
}

function killProcessOnPort(portStr: string | number) {
  const port = String(portStr).trim();
  if (!port) return;

  try {
    let pids: string[] = [];
    if (process.platform === 'win32') {
      const netstatOutput = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      const lines = netstatOutput.split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].endsWith(`:${port}`)) {
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && pid !== String(process.pid)) {
            pids.push(pid);
          }
        }
      }
    } else {
      const lsofOutput = execSync(`lsof -t -i:${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      if (lsofOutput) {
        pids = lsofOutput.split('\n').map((p) => p.trim()).filter((p) => p && p !== String(process.pid));
      }
    }

    const uniquePids = Array.from(new Set(pids));
    for (const pid of uniquePids) {
      console.log(`${COLOR_YELLOW}[Cleanup] Killing process listening on port ${port} (PID: ${pid})...${COLOR_RESET}`);
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        } else {
          process.kill(Number(pid), 'SIGKILL');
        }
      } catch {}
    }
  } catch {}
}

function killPreviousServiceProcesses(serviceKey?: string) {
  const targets = serviceKey ? [serviceKey] : Object.keys(SERVICES);

  for (const key of targets) {
    const service = SERVICES[key];
    if (!service) continue;

    const pattern = service.distPath;
    try {
      if (process.platform !== 'win32') {
        const psOutput = execSync(`ps aux | grep "${pattern}" | grep -v grep`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        if (psOutput) {
          const lines = psOutput.split('\n');
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[1];
            if (pid && pid !== String(process.pid)) {
              console.log(`${COLOR_YELLOW}[Cleanup] Killing previous ${key} process (PID: ${pid})...${COLOR_RESET}`);
              try {
                process.kill(Number(pid), 'SIGKILL');
              } catch {}
            }
          }
        }
      }
    } catch {}
  }
}

function killAllPreviousBackend(customEnv: Record<string, string> = {}) {
  console.log(`${COLOR_YELLOW}[Cleanup] Terminating any previous running Browcall instances & releasing ports...${COLOR_RESET}`);
  killPreviousServiceProcesses();

  const apiPort = customEnv['PORT'] || SERVICES['gpt-auto-api']?.defaultEnv['PORT'] || '8766';
  const apiWsPort = customEnv['WS_PORT_API'] || SERVICES['gpt-auto-api']?.defaultEnv['WS_PORT'] || '8765';
  const gatewayPort = customEnv['PORT_GATEWAY'] || SERVICES['mcp-gateway']?.defaultEnv['PORT'] || '8767';
  const wsPort = customEnv['WS_PORT'] || SERVICES['mcp-gateway']?.defaultEnv['WS_PORT'] || '8768';

  killProcessOnPort(apiPort);
  killProcessOnPort(apiWsPort);
  killProcessOnPort(gatewayPort);
  killProcessOnPort(wsPort);
}

function startService(serviceKey: string, customEnv: Record<string, string> = {}): boolean {
  const service = SERVICES[serviceKey];
  if (!service) {
    console.error(`${COLOR_RED}Error: Unknown service "${serviceKey}"${COLOR_RESET}`);
    return false;
  }

  if (activeProcesses.has(serviceKey)) {
    console.log(`${COLOR_YELLOW}Service "${serviceKey}" is already running.${COLOR_RESET}`);
    return true;
  }

  // Build service-specific isolated environment map
  const serviceSpecificEnv: Record<string, string> = {};

  if (serviceKey === 'gpt-auto-api') {
    const httpPort = customEnv['PORT'] || service.defaultEnv['PORT'] || '8766';
    const wsPort = customEnv['WS_PORT_API'] || service.defaultEnv['WS_PORT'] || '8765';
    killPreviousServiceProcesses(serviceKey);
    killProcessOnPort(httpPort);
    killProcessOnPort(wsPort);

    serviceSpecificEnv['PORT'] = httpPort;
    serviceSpecificEnv['HTTP_PORT'] = httpPort;
    serviceSpecificEnv['WS_PORT'] = wsPort;
  } else if (serviceKey === 'mcp-gateway') {
    const httpPort = customEnv['PORT_GATEWAY'] || service.defaultEnv['PORT'] || '8767';
    const wsPort = customEnv['WS_PORT'] || service.defaultEnv['WS_PORT'] || '8768';
    killPreviousServiceProcesses(serviceKey);
    killProcessOnPort(httpPort);
    killProcessOnPort(wsPort);

    serviceSpecificEnv['PORT'] = httpPort;
    serviceSpecificEnv['GATEWAY_HTTP_PORT'] = httpPort;
    serviceSpecificEnv['WS_PORT'] = wsPort;
    serviceSpecificEnv['GATEWAY_WS_PORT'] = wsPort;
  } else if (serviceKey === 'local-mcp-bridge') {
    killPreviousServiceProcesses(serviceKey);
    const targetWsPort = customEnv['WS_PORT'] || '8768';
    const targetHost = customEnv['GATEWAY_HOST'] || 'localhost';
    const gwUrl = customEnv['GATEWAY_URL'] || `ws://${targetHost}:${targetWsPort}`;
    serviceSpecificEnv['GATEWAY_URL'] = gwUrl;
    serviceSpecificEnv['GATEWAY_WS_URL'] = gwUrl;
  }

  const resolvedPath = resolveServicePath(serviceKey);
  if (!resolvedPath) {
    console.error(
      `${COLOR_RED}Error: Could not locate build file for "${serviceKey}".${COLOR_RESET}\n` +
      `Expected main.js at dist/apps/${service.distPath}\n` +
      `Please ensure all backend apps are built by running: ${COLOR_BOLD}yarn build${COLOR_RESET} or ${COLOR_BOLD}nx run-many -t build${COLOR_RESET}`
    );
    return false;
  }

  const mergedEnv = {
    ...process.env,
    ...service.defaultEnv,
    ...serviceSpecificEnv,
  };

  const prefix = `${service.color}[${service.name}]${COLOR_RESET} `;
  console.log(`${prefix}Starting from ${COLOR_BOLD}${resolvedPath}${COLOR_RESET}...`);

  const child = spawn(process.execPath, [resolvedPath], {
    env: mergedEnv,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString('utf8').split('\n');
    for (const line of lines) {
      if (line.trim().length > 0) {
        console.log(`${prefix}${line}`);
      }
    }
  });

  child.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString('utf8').split('\n');
    for (const line of lines) {
      if (line.trim().length > 0) {
        console.error(`${prefix}${COLOR_RED}${line}${COLOR_RESET}`);
      }
    }
  });

  child.on('exit', (code, signal) => {
    activeProcesses.delete(serviceKey);
    const exitMsg = code !== null ? `exited with code ${code}` : `terminated by signal ${signal}`;
    console.log(`${prefix}${COLOR_YELLOW}Process ${exitMsg}${COLOR_RESET}`);
  });

  child.on('error', (err) => {
    activeProcesses.delete(serviceKey);
    console.error(`${prefix}${COLOR_RED}Failed to start process:${COLOR_RESET}`, err);
  });

  activeProcesses.set(serviceKey, {
    process: child,
    config: service,
    startTime: new Date(),
  });

  return true;
}

function stopService(serviceKey: string) {
  const active = activeProcesses.get(serviceKey);
  if (!active) {
    console.log(`${COLOR_YELLOW}Service "${serviceKey}" is not running.${COLOR_RESET}`);
    return;
  }

  console.log(`${active.config.color}[${serviceKey}]${COLOR_RESET} Stopping process...`);
  active.process.kill('SIGINT');
  setTimeout(() => {
    if (activeProcesses.has(serviceKey)) {
      active.process.kill('SIGKILL');
    }
  }, 2000);
}

let ngrokChildProcess: ChildProcess | null = null;

function getNgrokPublicUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.tunnels && parsed.tunnels.length > 0) {
            const httpsTunnel = parsed.tunnels.find((t: any) => t.proto === 'https') || parsed.tunnels[0];
            resolve(httpsTunnel.public_url);
            return;
          }
        } catch {}
        resolve(null);
      });
    });
    req.on('error', () => resolve(null));
  });
}

async function startNgrokTunnel(gatewayPort: string | number, authtoken?: string): Promise<string | null> {
  const existingUrl = await getNgrokPublicUrl();
  if (existingUrl) {
    return existingUrl;
  }

  if (authtoken) {
    try {
      execSync(`ngrok config add-authtoken ${authtoken}`, { stdio: 'pipe' });
    } catch {}
  }

  console.log(`${COLOR_CYAN}[Ngrok] Starting ngrok tunnel for MCP Gateway on port ${gatewayPort}...${COLOR_RESET}`);

  let child: ChildProcess;
  try {
    child = spawn('ngrok', ['http', String(gatewayPort)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    child = spawn('npx', ['-y', 'ngrok', 'http', String(gatewayPort)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  ngrokChildProcess = child;

  child.on('error', () => {
    try {
      const fallbackChild = spawn('npx', ['-y', 'ngrok', 'http', String(gatewayPort)], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      ngrokChildProcess = fallbackChild;
    } catch {}
  });

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const publicUrl = await getNgrokPublicUrl();
    if (publicUrl) {
      return publicUrl;
    }
  }

  return null;
}

function stopAllServices(customEnv: Record<string, string> = {}) {
  console.log(`\n${COLOR_YELLOW}Stopping all running services and releasing ports...${COLOR_RESET}`);
  if (ngrokChildProcess) {
    try {
      ngrokChildProcess.kill('SIGKILL');
      ngrokChildProcess = null;
    } catch {}
  }
  for (const [key] of activeProcesses) {
    stopService(key);
  }
  killAllPreviousBackend(customEnv);
}

function showStatus() {
  console.log(`\n${COLOR_BOLD}=== Browcall Backend Component Status ===${COLOR_RESET}\n`);
  for (const [key, service] of Object.entries(SERVICES)) {
    const resolvedPath = resolveServicePath(key);
    const active = activeProcesses.get(key);
    const isBuilt = resolvedPath !== null;
    const isRunning = active !== undefined;

    const statusStr = isRunning
      ? `${COLOR_GREEN}RUNNING${COLOR_RESET} (PID: ${active.process.pid})`
      : isBuilt
      ? `${COLOR_CYAN}READY${COLOR_RESET} (Built)`
      : `${COLOR_RED}MISSING BUILD${COLOR_RESET}`;

    console.log(`${service.color}● ${service.name}${COLOR_RESET}`);
    console.log(`  Description : ${service.description}`);
    console.log(`  Status      : ${statusStr}`);
    console.log(`  Dist Path   : ${resolvedPath || 'Not found'}`);
    console.log(`  Default Env : ${JSON.stringify(service.defaultEnv)}`);
    console.log('');
  }
}

function printNgrokBanner(ngrokUrl: string) {
  const mcpUrl = `${ngrokUrl}/mcp`;
  const sseUrl = `${ngrokUrl}/sse`;
  console.log(`
${COLOR_GREEN}${COLOR_BOLD}================================================================${COLOR_RESET}
${COLOR_GREEN}${COLOR_BOLD}   🌐 MCP GATEWAY ONLINE PUBLIC ENDPOINTS (NGROK TUNNEL)       ${COLOR_RESET}
${COLOR_GREEN}${COLOR_BOLD}================================================================${COLOR_RESET}
  ● ${COLOR_BOLD}Online MCP Endpoint (HTTP)${COLOR_RESET}  : ${COLOR_CYAN}${COLOR_BOLD}${mcpUrl}${COLOR_RESET}
  ● ${COLOR_BOLD}Live SSE Endpoint (Streaming)${COLOR_RESET}: ${COLOR_CYAN}${COLOR_BOLD}${sseUrl}${COLOR_RESET}
  ● Health Check URL            : ${COLOR_BLUE}${ngrokUrl}/health${COLOR_RESET}
  ● Active Bridges URL          : ${COLOR_BLUE}${ngrokUrl}/bridges${COLOR_RESET}

  ${COLOR_YELLOW}👉 Copy & import "${COLOR_BOLD}${mcpUrl}${COLOR_RESET}${COLOR_YELLOW}" or "${COLOR_BOLD}${sseUrl}${COLOR_RESET}${COLOR_YELLOW}" as your remote MCP Server in online AI Clients / Cursor / Claude!${COLOR_RESET}
${COLOR_GREEN}${COLOR_BOLD}================================================================${COLOR_RESET}
`);
}

function printHeader() {
  console.log(`
${COLOR_CYAN}${COLOR_BOLD}=====================================================${COLOR_RESET}
${COLOR_CYAN}${COLOR_BOLD}       🚀 BROWCALL BACKEND COMPONENT LAUNCHER        ${COLOR_RESET}
${COLOR_CYAN}${COLOR_BOLD}=====================================================${COLOR_RESET}
`);
}

function printHelp() {
  printHeader();
  console.log(`
${COLOR_BOLD}USAGE:${COLOR_RESET}
  browcall [command] [options]
  interface-cli [command] [options]

${COLOR_BOLD}COMMANDS:${COLOR_RESET}
  ${COLOR_GREEN}start [services...]${COLOR_RESET}    Start specified backend components or all if none given.
                         Valid services: ${COLOR_CYAN}gpt-auto-api${COLOR_RESET}, ${COLOR_MAGENTA}mcp-gateway${COLOR_RESET}, ${COLOR_GREEN}local-mcp-bridge${COLOR_RESET}
  ${COLOR_GREEN}status${COLOR_RESET}                 Show build and running status of all services.
  ${COLOR_GREEN}interactive${COLOR_RESET}            Launch interactive wizard interface with port & project prompts.
  ${COLOR_GREEN}generate-config${COLOR_RESET}        Generate mcp-config.json from template for a target project.
  ${COLOR_GREEN}kill / stop${COLOR_RESET}            Kill any previously running Browcall processes and release ports.
  ${COLOR_GREEN}help${COLOR_RESET}                   Display this help message.

${COLOR_BOLD}OPTIONS:${COLOR_RESET}
  ${COLOR_YELLOW}--all${COLOR_RESET}                  Start all 3 backend components.
  ${COLOR_YELLOW}--api${COLOR_RESET}                  Start gpt-auto-api service.
  ${COLOR_YELLOW}--gateway${COLOR_RESET}              Start mcp-gateway service.
  ${COLOR_YELLOW}--bridge${COLOR_RESET}               Start local-mcp-bridge service.
  ${COLOR_YELLOW}--project-dir <path>${COLOR_RESET}   Target project directory (default: ${process.cwd()}).
  ${COLOR_YELLOW}--port-api <port>${COLOR_RESET}       Set port for gpt-auto-api (default: 8766).
  ${COLOR_YELLOW}--port-gateway <port>${COLOR_RESET}   Set HTTP port for mcp-gateway (default: 8767).
  ${COLOR_YELLOW}--port-ws <port>${COLOR_RESET}        Set WebSocket port for mcp-gateway (default: 8768).
  ${COLOR_YELLOW}--ngrok${COLOR_RESET}                 Expose MCP Gateway via public ngrok HTTPS tunnel.
  ${COLOR_YELLOW}--ngrok-authtoken <token>${COLOR_RESET} Set optional ngrok authtoken.
  ${COLOR_YELLOW}--generate-config${COLOR_RESET}      Build mcp-config.json from mcp-config.sample.json template.
  ${COLOR_YELLOW}--env-file <path>${COLOR_RESET}       Path to .env file to load.

${COLOR_BOLD}EXAMPLES:${COLOR_RESET}
  ${COLOR_BLUE}# Start all services targeting a specific new project folder${COLOR_RESET}
  browcall start --all --project-dir /path/to/my-project --generate-config

  ${COLOR_BLUE}# Start all services with public ngrok tunnel for MCP Gateway${COLOR_RESET}
  browcall start --all --ngrok

  ${COLOR_BLUE}# Start with custom ports${COLOR_RESET}
  browcall start gpt-auto-api mcp-gateway --port-api 9000 --port-ws 8800

  ${COLOR_BLUE}# Generate mcp-config.json for target project${COLOR_RESET}
  browcall generate-config --project-dir /path/to/my-project

  ${COLOR_BLUE}# Run in interactive wizard mode${COLOR_RESET}
  browcall interactive
`);
}

async function runInteractiveMode(options: Record<string, string>) {
  printHeader();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptQuestion = (query: string, defaultValue?: string): Promise<string> => {
    return new Promise((resolve) => {
      const qText = defaultValue ? `${query} [${defaultValue}]: ` : `${query}: `;
      rl.question(qText, (answer) => {
        const val = answer.trim();
        resolve(val || defaultValue || '');
      });
    });
  };

  console.log(`${COLOR_BOLD}--- Configuration Wizard ---${COLOR_RESET}\n`);

  const projectDir = await promptQuestion('Enter target project execution directory', options['PROJECT_DIR'] || process.cwd());
  const apiHttpPort = await promptQuestion('Enter GPT Auto API HTTP Port', options['PORT'] || '8766');
  const apiWsPort = await promptQuestion('Enter GPT Auto API Browser WebSocket Port', options['WS_PORT_API'] || '8765');
  const gatewayHttpPort = await promptQuestion('Enter MCP Gateway HTTP Port', options['PORT_GATEWAY'] || '8767');
  const gatewayWsPort = await promptQuestion('Enter MCP Gateway WebSocket Port', options['WS_PORT'] || '8768');
  const enableNgrok = await promptQuestion('Expose MCP Gateway publicly via ngrok tunnel? (Y/n)', 'Y');
  const genConfig = await promptQuestion('Generate mcp-config.json from template? (Y/n)', 'Y');

  options['PORT'] = apiHttpPort;
  options['WS_PORT_API'] = apiWsPort;
  options['PORT_GATEWAY'] = gatewayHttpPort;
  options['WS_PORT'] = gatewayWsPort;
  options['PROJECT_DIR'] = projectDir;

  if (enableNgrok.toLowerCase().startsWith('y')) {
    options['NGROK'] = 'true';
    const authToken = await promptQuestion('Enter optional ngrok authtoken (press Enter to skip)', '');
    if (authToken) {
      options['NGROK_AUTHTOKEN'] = authToken;
    }
  }

  if (genConfig.toLowerCase().startsWith('y')) {
    const configPath = generateMcpConfigFromTemplate(projectDir, gatewayWsPort);
    options['BRIDGE_CONFIG_PATH'] = configPath;
  }

  while (true) {
    console.log(`\n${COLOR_BOLD}Select Action:${COLOR_RESET}`);
    console.log(`  1. Start All Services (${COLOR_CYAN}gpt-auto-api${COLOR_RESET}, ${COLOR_MAGENTA}mcp-gateway${COLOR_RESET}, ${COLOR_GREEN}local-mcp-bridge${COLOR_RESET})`);
    console.log(`  2. Select & Start Specific Service`);
    console.log(`  3. View Services Status & Ports`);
    console.log(`  4. Re-generate mcp-config.json from template`);
    console.log(`  5. Stop All Running Services`);
    console.log(`  6. Exit CLI`);

    const answer = (await promptQuestion(`\n${COLOR_BOLD}Enter option (1-6)${COLOR_RESET}`, '1')).trim();

    if (answer === '1') {
      console.log(`\n${COLOR_GREEN}Starting all backend components...${COLOR_RESET}`);
      for (const key of Object.keys(SERVICES)) {
        startService(key, options);
      }
      if (options['NGROK'] === 'true') {
        const gatewayPort = options['PORT_GATEWAY'] || SERVICES['mcp-gateway']?.defaultEnv['PORT'] || '8767';
        const ngrokUrl = await startNgrokTunnel(gatewayPort, options['NGROK_AUTHTOKEN']);
        if (ngrokUrl) {
          printNgrokBanner(ngrokUrl);
        }
      }
    } else if (answer === '2') {
      console.log(`\nAvailable Services:`);
      const keys = Object.keys(SERVICES);
      keys.forEach((key, index) => {
        console.log(`  ${index + 1}. ${SERVICES[key].name} - ${SERVICES[key].description}`);
      });
      const selectedIdx = (await promptQuestion(`\nSelect service number (1-${keys.length})`, '1')).trim();
      const idx = parseInt(selectedIdx, 10) - 1;
      if (idx >= 0 && idx < keys.length) {
        const chosenKey = keys[idx];
        startService(chosenKey, options);
        if (chosenKey === 'mcp-gateway' && options['NGROK'] === 'true') {
          const gatewayPort = options['PORT_GATEWAY'] || SERVICES['mcp-gateway']?.defaultEnv['PORT'] || '8767';
          const ngrokUrl = await startNgrokTunnel(gatewayPort, options['NGROK_AUTHTOKEN']);
          if (ngrokUrl) {
            printNgrokBanner(ngrokUrl);
          }
        }
      } else {
        console.log(`${COLOR_RED}Invalid selection.${COLOR_RESET}`);
      }
    } else if (answer === '3') {
      showStatus();
    } else if (answer === '4') {
      const configPath = generateMcpConfigFromTemplate(projectDir, gatewayWsPort);
      options['BRIDGE_CONFIG_PATH'] = configPath;
    } else if (answer === '5') {
      stopAllServices(options);
    } else if (answer === '6' || answer.toLowerCase() === 'q') {
      console.log(`\nExiting CLI...`);
      stopAllServices(options);
      rl.close();
      process.exit(0);
    } else {
      console.log(`${COLOR_RED}Invalid option, please choose 1-6.${COLOR_RESET}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Global process signal listeners for graceful cleanup
  process.on('SIGINT', () => {
    stopAllServices(options);
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stopAllServices(options);
    process.exit(0);
  });
  process.on('exit', () => {
    stopAllServices(options);
  });

  if (args.length === 0) {
    if (process.stdin.isTTY) {
      await runInteractiveMode({});
      return;
    } else {
      printHelp();
      return;
    }
  }

  const command = args[0].toLowerCase();
  const options: Record<string, string> = {
    NGROK: 'true',
  };
  const requestedServices: string[] = [];
  let shouldGenerateConfig = false;
  let targetProjectDir = process.cwd();

  // Parse arguments and flags
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h' || command === 'help') {
      printHelp();
      return;
    } else if (arg === 'status') {
      showStatus();
      return;
    } else if (arg === 'interactive' || arg === '--interactive') {
      await runInteractiveMode(options);
      return;
    } else if (arg === 'generate-config' || arg === '--generate-config') {
      shouldGenerateConfig = true;
    } else if (arg === '--all') {
      requestedServices.push(...Object.keys(SERVICES));
    } else if (arg === '--api') {
      requestedServices.push('gpt-auto-api');
    } else if (arg === '--gateway') {
      requestedServices.push('mcp-gateway');
    } else if (arg === '--bridge') {
      requestedServices.push('local-mcp-bridge');
    } else if (arg === '--project-dir' && i + 1 < args.length) {
      targetProjectDir = args[++i];
      options['PROJECT_DIR'] = targetProjectDir;
    } else if (arg === '--port-api' && i + 1 < args.length) {
      options['PORT'] = args[++i];
    } else if ((arg === '--port-api-ws' || arg === '--port-ws-api') && i + 1 < args.length) {
      options['WS_PORT_API'] = args[++i];
    } else if (arg === '--port-gateway' && i + 1 < args.length) {
      options['PORT_GATEWAY'] = args[++i];
    } else if (arg === '--port-ws' && i + 1 < args.length) {
      options['WS_PORT'] = args[++i];
    } else if (arg === '--ngrok') {
      options['NGROK'] = 'true';
    } else if (arg === '--no-ngrok') {
      options['NGROK'] = 'false';
    } else if (arg === '--ngrok-authtoken' && i + 1 < args.length) {
      options['NGROK'] = 'true';
      options['NGROK_AUTHTOKEN'] = args[++i];
    } else if (arg === '--env-file' && i + 1 < args.length) {
      const fileEnv = loadEnvFile(args[++i]);
      Object.assign(options, fileEnv);
    } else if (SERVICES[arg]) {
      requestedServices.push(arg);
    }
  }

  if (command === 'kill' || command === 'stop' || command === 'kill-previous') {
    printHeader();
    killAllPreviousBackend(options);
    console.log(`${COLOR_GREEN}${COLOR_BOLD}✅ All previous Browcall processes killed and ports released.${COLOR_RESET}\n`);
    return;
  }

  if (command === 'generate-config' && requestedServices.length === 0) {
    const wsPort = options['WS_PORT'] || '8768';
    generateMcpConfigFromTemplate(targetProjectDir, wsPort);
    return;
  }

  if (command === 'start' || requestedServices.length > 0 || shouldGenerateConfig) {
    printHeader();

    if (shouldGenerateConfig) {
      const wsPort = options['WS_PORT'] || '8768';
      const configPath = generateMcpConfigFromTemplate(targetProjectDir, wsPort);
      options['BRIDGE_CONFIG_PATH'] = configPath;
    }

    const toStart = requestedServices.length > 0
      ? Array.from(new Set(requestedServices))
      : Object.keys(SERVICES);

    console.log(`${COLOR_BOLD}Launching backend components:${COLOR_RESET} ${toStart.join(', ')}\n`);

    let startedCount = 0;
    for (const serviceKey of toStart) {
      if (startService(serviceKey, options)) {
        startedCount++;
      }
    }

    if (startedCount === 0) {
      console.error(`\n${COLOR_RED}No services could be started.${COLOR_RESET}`);
      process.exit(1);
    }

    if (options['NGROK'] === 'true' && toStart.includes('mcp-gateway')) {
      const gatewayPort = options['PORT_GATEWAY'] || SERVICES['mcp-gateway']?.defaultEnv['PORT'] || '8767';
      const ngrokUrl = await startNgrokTunnel(gatewayPort, options['NGROK_AUTHTOKEN']);
      if (ngrokUrl) {
        printNgrokBanner(ngrokUrl);
      } else {
        console.warn(`${COLOR_YELLOW}[Ngrok] Could not establish ngrok tunnel. Make sure ngrok is installed or run 'npm i -g ngrok'.${COLOR_RESET}`);
      }
    }

    console.log(`\n${COLOR_GREEN}${COLOR_BOLD}Backend components launched successfully.${COLOR_RESET} Press Ctrl+C to stop all services.\n`);

    // Keep event loop active
    setInterval(() => {}, 10000);
  } else {
    console.error(`${COLOR_RED}Unknown command or arguments: ${args.join(' ')}${COLOR_RESET}\n`);
    printHelp();
  }
}

main().catch((err) => {
  console.error(`${COLOR_RED}Fatal CLI Error:${COLOR_RESET}`, err);
  process.exit(1);
});
