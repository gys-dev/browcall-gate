# MCP Gateway (`@browcall/mcp-gateway`)

> Remote Model Context Protocol (MCP) Gateway server implementation following the [MCP TypeScript SDK Spec (2026-07-28)](https://modelcontextprotocol.io/docs/2026-07-28/develop/build-server#typescript).

The **MCP Gateway** acts as a remote **MCP Server & Proxy** built on Node.js, TypeScript, and Express. It enables AI Clients (like ChatGPT, Claude, or custom LLM clients) to discover and execute MCP **tools**, **resources**, and **prompts** hosted on local user machines through persistent WebSocket bridges (`@browcall/local-mcp-bridge`).

---

## 🏛 Architecture & Protocol Design

The MCP Gateway bridges HTTP/SSE client connections to local stdio/process bridges over WebSocket:

```text
 ┌────────────────────────────────────────────────────────┐
 │ MCP Client / GPT                                       │
 └───────────────────────────┬────────────────────────────┘
                             │  MCP JSON-RPC 2.0 over HTTP / SSE
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │ MCP Gateway (Express + WebSocket Server)               │
 │                                                        │
 │  ├── HTTP API / SSE Endpoint (Port 8767)               │
 │  │   ├── POST /mcp (JSON-RPC 2.0)                      │
 │  │   ├── GET /sse & POST /messages (SSE Transport)     │
 │  │   └── GET /health, GET /bridges                     │
 │  │                                                     │
 │  └── WebSocket Server (Port 8768)                      │
 │      └── Bridge Manager: Map<bridgeId, LocalBridge>    │
 └───────────────────────────┬────────────────────────────┘
                             │  Outbound WebSocket (/ws)
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │ Local MCP Bridge (User Local Machine)                  │
 └───────────────────────────┬────────────────────────────┘
                             │  Stdio / Process Transport
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │ Local MCP Server (e.g. filesystem, github, custom)     │
 └────────────────────────────────────────────────────────┘
```

---

## 📦 Requirements & Dependencies

In accordance with the official `@modelcontextprotocol/sdk` TypeScript specification:

- **Node.js**: v18.0.0+
- **TypeScript**: v5.0+
- **Core Dependencies**:
  - `@modelcontextprotocol/sdk`: Official MCP SDK
  - `zod`: Schema definition and input validation
  - `express`: HTTP web server
  - `ws`: WebSocket server for bridge routing

```bash
npm install express ws dotenv cors body-parser
npm install --save-dev typescript @types/node @types/express @types/ws
```

---

## ⚡ MCP Server Capabilities

Following the MCP Server specification, the Gateway supports the core MCP primitives:

| Capability | Supported | Description |
| :--- | :---: | :--- |
| **Tools** (`tools/list`, `tools/call`) | ✅ | Discovers & executes functions on remote local bridges (e.g., `read_file`, `write_file`) |
| **Resources** (`resources/list`, `resources/read`) | ✅ | Reads remote file resources or static data streams |
| **Prompts** (`prompts/list`, `prompts/get`) | ✅ | Fetches parameterized prompt templates from local MCP servers |
| **Server-Sent Events (SSE)** | ✅ | Establishes persistent server-to-client event stream via `SSEServerTransport` |
| **Streamable HTTP / JSON-RPC** | ✅ | Standard POST endpoint (`/mcp`) for stateless JSON-RPC 2.0 method calls |

---

## 📂 Project Structure

```text
apps/mcp-gateway/
├── project.json            # Nx project configuration (build & serve targets)
├── package.json            # Package metadata & dependencies
├── tsconfig.json           # Base TypeScript configuration
├── tsconfig.app.json       # App build TypeScript configuration
└── src/
    ├── main.ts             # Server entry point (Express + WebSocket setup)
    ├── types.ts            # MCP JSON-RPC & Bridge TypeScript definitions
    ├── routes/
    │   └── mcp.ts          # Express router (/mcp, /bridges, /health)
    └── services/
        └── bridge-manager.ts # Bridge registry & request correlator
```

---

## 🛠 TypeScript Server Implementation Guide

### 1. Initializing Server & Bridge Registry

The Gateway uses `BridgeManager` to track active local bridge connections and route incoming JSON-RPC requests:

```typescript
import express from 'express';
import { WebSocketServer } from 'ws';
import { BridgeManager } from './services/bridge-manager';
import { createMcpRouter } from './routes/mcp';

const app = express();
const bridgeManager = new BridgeManager();

// Mount MCP HTTP Router
app.use(createMcpRouter(bridgeManager));

// Start HTTP Server
const server = app.listen(8767, () => {
  console.log('MCP Gateway HTTP server listening on http://localhost:8767');
});

// Start WebSocket Server for Bridges
const wss = new WebSocketServer({ port: 8768 });
wss.on('connection', (ws) => {
  // Bridge registration logic...
});
```

---

## 📖 API Specification (MCP JSON-RPC 2.0)

### 1. Handshake & Initialization (`initialize`)

Clients initiate connection by sending the `initialize` method:

#### Request:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2026-07-28",
    "capabilities": {
      "roots": { "listChanged": true },
      "sampling": {}
    },
    "clientInfo": {
      "name": "GPT-4 Client",
      "version": "1.0.0"
    }
  }
}
```

#### Response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2026-07-28",
    "capabilities": {
      "tools": { "listChanged": true },
      "resources": { "subscribe": true, "listChanged": true },
      "prompts": { "listChanged": true }
    },
    "serverInfo": {
      "name": "MCP Gateway",
      "version": "1.0.0"
    }
  }
}
```

---

### 2. Tool Discovery (`tools/list`)

Queries available tools registered across connected Local MCP Bridges:

#### Request:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

#### Response:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "read_file",
        "description": "Read complete text content of a file from the local workspace.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "Absolute path to the file to read"
            }
          },
          "required": ["path"]
        }
      }
    ]
  }
}
```

---

### 3. Tool Execution (`tools/call`)

Executes a tool on a local machine through the bridge router:

#### Request:
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": {
      "path": "/Users/me/project/package.json"
    }
  }
}
```

#### Response:
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\n  \"name\": \"my-project\",\n  \"version\": \"1.0.0\"\n}"
      }
    ],
    "isError": false
  }
}
```

---

### 4. Gateway Diagnostics Endpoints

#### `GET /health`
Returns gateway status and connected bridge metrics:
```json
{
  "status": "ok",
  "service": "mcp-gateway",
  "activeBridgesCount": 1,
  "bridges": [
    {
      "bridgeId": "mac-local-bridge",
      "clientName": "Local Mac MCP Bridge",
      "connectedAt": "2026-08-15T15:40:47.438Z",
      "toolsCount": 14
    }
  ]
}
```

#### `GET /bridges`
Returns all registered bridges and aggregated tool list.

---

## 🏃 Building & Running

```bash
# Start Gateway in development mode
yarn serve:gateway

# Build production artifact
yarn build:gateway

# Run compiled production server
yarn start:gateway --port 8767 --ws-port 8768
```

---

## 📚 References

- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [Building MCP Servers in TypeScript](https://modelcontextprotocol.io/docs/2026-07-28/develop/build-server#typescript)
- [Official TypeScript SDK Repository (`@modelcontextprotocol/sdk`)](https://github.com/modelcontextprotocol/typescript-sdk)
