# Browcall CLI (`@ducy23061999/browcall-cli`)

[![npm version](https://img.shields.io/npm/v/@ducy23061999/browcall-cli.svg?color=blue)](https://www.npmjs.com/package/@ducy23061999/browcall-cli)
[![license](https://img.shields.io/npm/l/@ducy23061999/browcall-cli.svg)](./LICENSE)

**Browcall CLI** is a self-contained launcher and management tool for Browcall backend services:
- **`gpt-auto-api`**: OpenAI/Anthropic compatible API & SSE server connecting to live browser automation.
- **`mcp-gateway`**: Remote Model Context Protocol (MCP) HTTP/WebSocket proxy and tool router.
- **`local-mcp-bridge`**: Local MCP stdio bridge linking local tool servers (like `@modelcontextprotocol/server-filesystem`) to the Gateway.

---

## ⚡ Quick Start

### Option 1: Instant Execution via `npx` (No installation needed)

Launch all 3 backend components instantly:
```bash
npx @ducy23061999/browcall-cli@latest start --all
```

Launch the interactive configuration wizard:
```bash
npx @ducy23061999/browcall-cli@latest
# or
npx @ducy23061999/browcall-cli@latest interactive
```

---

### Option 2: Global Installation via `npm` / `yarn`

```bash
npm install -g @ducy23061999/browcall-cli
# or
yarn global add @ducy23061999/browcall-cli
```

Once installed globally, you can use the short command `browcall`:

```bash
# Start all components
browcall start --all

# Launch interactive menu
browcall

# Check service build & process status
browcall status

# Kill previous running processes & free bound ports
browcall kill
```

---

## 🛠 Usage & Command Reference

```text
USAGE:
  browcall [command] [options]
  interface-cli [command] [options]
  npx @ducy23061999/browcall-cli [command] [options]
```

### Commands

| Command | Description |
|---|---|
| `start [services...]` | Start specified backend components or all if none given (`gpt-auto-api`, `mcp-gateway`, `local-mcp-bridge`). |
| `interactive` | Launch interactive wizard to configure project directories and component ports. |
| `generate-config` | Build `mcp-config.json` from template for a target project directory. |
| `status` | View running PID and build status of all backend components. |
| `kill` / `stop` | Automatically terminate previous running Browcall instances and release bound ports. |
| `help` | Display CLI help menu. |

---

### Command Options & Flags

| Flag | Parameter | Default | Description |
|---|---|---|---|
| `--all` | N/A | N/A | Launch all 3 backend services simultaneously. |
| `--api` | N/A | N/A | Launch `gpt-auto-api` service only. |
| `--gateway` | N/A | N/A | Launch `mcp-gateway` service only. |
| `--bridge` | N/A | N/A | Launch `local-mcp-bridge` service only. |
| `--project-dir` | `<path>` | `process.cwd()` | Target execution directory for filesystem MCP tools. |
| `--port-api` | `<port>` | `8766` | Set HTTP API port for `gpt-auto-api`. |
| `--port-api-ws` | `<port>` | `8765` | Set Browser Extension WebSocket port for `gpt-auto-api`. |
| `--port-gateway` | `<port>` | `8767` | Set HTTP endpoint port for `mcp-gateway`. |
| `--port-ws` | `<port>` | `8768` | Set WebSocket router port for `mcp-gateway` & bridge target. |
| `--ngrok` | N/A | N/A | Expose MCP Gateway via public ngrok HTTPS tunnel for online MCP importing. |
| `--ngrok-authtoken` | `<token>` | N/A | Optional ngrok authtoken. |
| `--generate-config` | N/A | N/A | Auto-generate `mcp-config.json` inside `--project-dir`. |
| `--env-file` | `<path>` | N/A | Path to custom `.env` file to load environment variables from. |

---

## 💡 Practical Examples

### 1. Start all components for a specific target project
```bash
browcall start --all --project-dir /Users/username/Projects/my-app --generate-config
```

### 2. Run with custom ports
```bash
browcall start --all \
  --port-api 9000 \
  --port-api-ws 9001 \
  --port-gateway 9002 \
  --port-ws 9003
```

### 3. Generate `mcp-config.json` template only
```bash
browcall generate-config --project-dir /Users/username/Projects/my-app
```

---

## 🤖 Connecting AI Clients & Claude Code CLI

### 1. Claude Code CLI (Anthropic API Compatible)
Set environment variables to route Claude Code completions through `gpt-auto-api`:

```bash
export ANTHROPIC_BASE_URL="http://localhost:8766"
export ANTHROPIC_API_KEY=""

# Run Claude Code CLI
claude
```

### 2. OpenAI Compatible API Clients
- **Base URL**: `http://localhost:8766/v1`
- **Endpoint**: `POST /v1/chat/completions`

### 3. MCP Clients (Claude Desktop, Cursor, AI Agents)
- **MCP HTTP Endpoint**: `http://localhost:8767/mcp`
- **Live SSE Endpoint**: `http://localhost:8767/sse`
- **Gateway WebSocket**: `ws://localhost:8768`
- **Public Ngrok Endpoints** (`--ngrok`): `https://xxxx.ngrok-free.app/mcp` & `https://xxxx.ngrok-free.app/sse`

For step-by-step setup guides, see the [Claude Code & AI Agent Guide](./docs/CLAUDE_CODE_GUIDE.md).

---

## 🧹 Automatic Cleanup & Port Release

Browcall CLI automatically handles process lifecycle and signal management:
- When starting services, any previous zombie instances or stale port bindings on `8766`, `8765`, `8767`, or `8768` are safely terminated.
- When pressing `Ctrl+C` or exiting the CLI, all child processes are killed and ports are freed cleanly.
- You can manually force cleanup anytime via `browcall kill`.

---

## 📄 License

MIT © [Tran Duc Y](https://github.com/gys-dev)
