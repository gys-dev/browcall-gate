# Local MCP Bridge (`@browcall/local-mcp-bridge`)

The **Local MCP Bridge** is a lightweight Node.js/TypeScript application designed to run locally on a user's machine. It bridges local stdio-based MCP servers (such as `@modelcontextprotocol/server-filesystem` or custom tools) with a remote **MCP Gateway** over an outbound WebSocket connection.

---

## 🏗 Architecture & Flow

```text
 ┌────────────────────────────────────────────────────────┐
 │  Local MCP Bridge (User Machine)                       │
 │                                                        │
 │  ┌─────────────────┐       Outbound WebSocket          │
 │  │ Gateway Client  ├──────────────────────────────┐   │
 │  └────────┬────────┘                              │   │
 │           │ Internal Routing                      ▼   │
 │  ┌────────┴────────┐                          MCP Gateway
 │  │ Local MCP       │                                  │
 │  │ Process Manager │                                  │
 │  └────────┬────────┘                                  │
 │           │ Stdio (JSON-RPC 2.0)                      │
 └───────────┼────────────────────────────────────────────┘
             ▼
 ┌──────────────────────┐
 │ Local MCP Server     │  (e.g., npx @modelcontextprotocol/server-filesystem)
 └──────────────────────┘
```

---

## 📂 Folder Structure

```text
apps/local-mcp-bridge/
├── project.json            # Nx project target definitions (build/serve)
├── package.json            # App dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── tsconfig.app.json       # App build tsconfig configuration
└── src/
    ├── main.ts             # CLI entry point loading config and starting services
    ├── types.ts            # Core TypeScript definitions (BridgeConfig, Stdio framing)
    └── services/
        ├── mcp-process.ts  # Spawns & manages stdio child processes for MCP servers
        └── gateway-client.ts # WebSocket client maintaining connection to MCP Gateway
```

---

## 🔍 Detailed Component Breakdown

### 1. `src/main.ts`
- Reads JSON configuration file passed via `--config <path>`, `BRIDGE_CONFIG_PATH` env var, or fallback `./mcp-config.json`.
- Instantiates `LocalMcpProcessManager` to start stdio processes.
- Instantiates `GatewayClient` to establish outbound WebSocket connection.
- Registers graceful shutdown hooks (`SIGINT`, `SIGTERM`) to kill child processes cleanly.

### 2. `src/services/mcp-process.ts`
- **Child Process Management**: Spawns local MCP servers using `child_process.spawn`.
- **Stdio Line Framing**: Listens on stdout of child process with `readline`, parsing newline-delimited JSON-RPC responses.
- **MCP Initialization**: Executes standard `initialize` request and `notifications/initialized` handshake with local servers.
- **Tool Aggregation & Execution**: Discovers available tools (`tools/list`) across all configured local servers and routes tool execution requests (`tools/call`) to the matching server process.

### 3. `src/services/gateway-client.ts`
- **Outbound Connection**: Connects to the remote Gateway WebSocket (`gatewayUrl`).
- **Registration**: Sends `register` payload containing `bridgeId` and list of discovered tools.
- **Request Dispatch**: Listens for forwarded JSON-RPC requests from Gateway, invokes local MCP servers via `LocalMcpProcessManager`, and sends the correlated response back over WebSocket.
- **Auto Reconnect**: Automatically attempts to reconnect every 5 seconds if connection to Gateway is lost.

---

## ⚙️ Configuration Format

The bridge reads a standard MCP JSON configuration file:

```json
{
  "gatewayUrl": "ws://localhost:8768",
  "bridgeId": "local-mac-bridge",
  "clientName": "Local Mac MCP Bridge",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/me/projects"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

---

## 💻 CLI & Execution Commands

### Commands
```bash
# Start Local MCP Bridge in development mode
yarn serve:bridge

# Start with custom configuration file
npx ts-node apps/local-mcp-bridge/src/main.ts --config ./my-mcp-config.json

# Build production bundle
yarn build:bridge

# Start compiled bridge binary
node dist/apps/local-mcp-bridge/main.js --config ./mcp-config.json
```
