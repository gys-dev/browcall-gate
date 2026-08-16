# MCP Gateway — MVP Development Prompt

Build a minimal system that allows GPT/ChatGPT to call MCP tools running on a user's local machine through a remote MCP Gateway.

The goal is to prove the simplest possible end-to-end flow:

```text
GPT
 │
 │ MCP
 ▼
MCP Gateway
 │
 │ WebSocket
 ▼
Local MCP Bridge
 │
 │ MCP
 ▼
Local MCP Server
```

## 1. MCP Gateway

Build the Gateway using:

* Node.js
* TypeScript
* Express
* WebSocket

Do not use NestJS, Redis, PostgreSQL, or other infrastructure for the MVP.

The Gateway should be as thin as possible. It should act only as an **MCP proxy/router**.

Responsibilities:

* Expose an MCP endpoint that GPT can connect to.
* Accept WebSocket connections from Local MCP Bridges.
* Keep track of connected Local MCP Bridges.
* Route MCP requests from GPT to the appropriate Local MCP Bridge.
* Route MCP responses from the Local MCP Bridge back to GPT.
* Never execute local tools itself.

A simple in-memory connection mapping is sufficient:

```typescript
Map<connectionId, LocalBridgeConnection>
```

## 2. Local MCP Bridge

Build a lightweight Node.js/TypeScript application that runs on the user's local machine.

Responsibilities:

1. Read the user's local MCP configuration.
2. Start/connect to the configured MCP servers.
3. Maintain connections to those MCP servers.
4. Establish an outbound WebSocket connection to the Gateway.
5. Forward MCP requests from the Gateway to the local MCP server.
6. Forward MCP responses back to the Gateway.
7. Forward tool discovery information from the local MCP server.

The local machine should not need to expose a publicly accessible port.

The connection should always be initiated by the local bridge:

```text
Local MCP Bridge → Gateway
```

not:

```text
Gateway → Local Machine
```

## 3. Local MCP Configuration

The Bridge should support a standard MCP configuration such as:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/me/projects"
      ]
    }
  }
}
```

The Bridge should use this configuration to start/connect to the local MCP server.

Initially, supporting one MCP server is sufficient. Design the code so multiple MCP servers can be added later.

## 4. MCP Tool Discovery

GPT should be able to discover tools from the connected local MCP server.

Example flow:

```text
GPT
 │
 │ tools/list
 ▼
Gateway
 │
 │ forward
 ▼
Local Bridge
 │
 │ tools/list
 ▼
Local MCP Server
 │
 │ tools
 ▼
Local Bridge
 │
 ▼
Gateway
 │
 ▼
GPT
```

For example, the filesystem MCP server may expose:

```text
read_file
write_file
list_directory
search_files
```

The Gateway should not need to understand the implementation of these tools.

It should simply proxy the MCP messages.

## 5. MCP Tool Execution

When GPT calls a tool:

```json
{
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": {
      "path": "/Users/me/project/package.json"
    }
  }
}
```

the request should flow through:

```text
GPT
 ↓
Gateway
 ↓
Local Bridge
 ↓
Local MCP Server
 ↓
Local filesystem
```

The result should flow back:

```text
Local filesystem
 ↓
Local MCP Server
 ↓
Local Bridge
 ↓
Gateway
 ↓
GPT
```

The Gateway must not execute or interpret the tool.

## 6. Request Correlation

MCP requests and responses must remain correctly correlated.

For example:

```text
GPT request ID
      │
      ▼
Gateway
      │
      ▼
Local Bridge
      │
      ▼
Local MCP Server
      │
      ▼
Response with same request ID
```

The Gateway should forward the MCP message without unnecessarily modifying its request/response structure.

## 7. Connection Model

For the MVP, assume:

* One Gateway process.
* Multiple possible Local MCP Bridges.
* One Local MCP Bridge per machine.
* In-memory connection management.
* A GPT connection must be associated with the appropriate Local MCP Bridge.

Example:

```text
Gateway

connections:
  machine-A → WebSocket A
  machine-B → WebSocket B
```

The routing mechanism can initially be simple. Avoid implementing distributed sessions or persistent state.

## 8. MVP Success Criteria

The MVP is successful when the following works:

1. Start the Gateway.
2. Start the Local MCP Bridge on a Mac.
3. The Bridge connects to the Gateway.
4. The Bridge starts/connects to a local filesystem MCP server.
5. GPT connects to the Gateway through MCP.
6. GPT discovers the local filesystem tools.
7. GPT calls `read_file`.
8. The local MCP server reads a real file from the user's machine.
9. The result is returned to GPT.

Example:

```text
User:
Read my local package.json

GPT
 ↓
MCP Gateway
 ↓
Local MCP Bridge
 ↓
Filesystem MCP
 ↓
/Users/me/project/package.json
 ↓
GPT
```

## 9. Keep the MVP Simple

Do NOT implement initially:

* User accounts
* Database
* Redis
* Multiple Gateway instances
* Kubernetes
* Dashboard
* Complex permission management
* Billing
* Marketplace
* Multiple machines
* Persistent sessions

Focus entirely on making this work:

```text
GPT → MCP Gateway → WebSocket → Local MCP Bridge → Local MCP Server
```

The final result should be a small, understandable TypeScript codebase that demonstrates the complete end-to-end MCP proxy flow.
