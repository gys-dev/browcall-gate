# GPT Auto API

GPT Auto API is the backend component of the GPT Inner Call project. It provides an OpenAI & Anthropic compatible API interface that bridges external requests to the Browcall Extension for processing.

## 🚀 Features

- **Live SSE Streaming**: Dedicated `/sse` endpoint (`GET` & `POST`) for real-time live rendering and delta streaming.
- **Claude Code & Anthropic Compatible**: Implements the `POST /v1/messages` specification supporting Claude Code CLI (`ANTHROPIC_BASE_URL=http://localhost:8766`).
- **OpenAI Compatible**: Implements the `POST /v1/chat/completions` specification with full SSE delta chunking for modern AI agents.
- **WebSocket Communication**: Maintains a persistent connection with the browser extension to forward requests.
- **Flexible Output**: Support for different output formats (`text`, `markdown`, `json`).

## 🛠 Installation & Running

### 1. Development Mode
To run the API with hot-reloading:

```bash
# From the project root
npm run serve
# or
yarn serve
```

The server starts by default at `http://localhost:8766`.

### 2. Production Build
To build and run the compiled version:

```bash
# Build the project
npm run build
# Start the production bundle
npm run start:api
```

## 📖 API Reference

### 1. Live Rendering SSE Endpoint (`/sse`, `/v1/sse`, `/v1/chat/sse`)

Streams real-time text updates as they render in the browser extension.

**URL**: `/sse` or `/v1/chat/sse`  
**Method**: `GET` or `POST`  
**Content-Type**: `text/event-stream`

#### Query / Body Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `prompt` / `q` | `string` | No* | Prompt text for single-prompt requests. |
| `messages` | `Array\|string` | No* | Array of message objects or string prompt. (*Either `prompt` or `messages` is required). |
| `outputFormat` | `string` | No | Desired format (`markdown`, `json`, `text`). Default: `text`. |

#### Example (cURL GET)

```bash
curl -N "http://localhost:8766/sse?prompt=Explain+quantum+physics"
```

---

### 2. Claude Code / Anthropic Messages API (`POST /v1/messages`)

Full compatibility with Claude Code CLI and Anthropic API clients.

**URL**: `/v1/messages`  
**Method**: `POST`  
**Content-Type**: `application/json`

#### Request Example (cURL)

```bash
curl -N --location 'http://localhost:8766/v1/messages' \
--header 'Content-Type: application/json' \
--data '{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    {
      "role": "user",
      "content": "Hello Claude Code"
    }
  ],
  "stream": true
}'
```

---

### 3. Chat Completions (`POST /v1/chat/completions`)

OpenAI-compatible chat completions endpoint for AI agents (Cursor, Windsurf, LangChain, etc.).

**URL**: `/v1/chat/completions`  
**Method**: `POST`  
**Content-Type**: `application/json`

#### Request Body

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `messages` | `Array` | Yes | An array of message objects (`role`, `content`). |
| `outputFormat` | `string` | No | Options: `markdown`, `json`, `text`. Default: `text`. |
| `stream` | `boolean` | No | Enable OpenAI SSE `chat.completion.chunk` delta streaming. |

#### Request Example (cURL)

```bash
curl -N --location 'http://localhost:8766/v1/chat/completions' \
--header 'Content-Type: application/json' \
--data '{
  "messages": [
    {
      "role": "user",
      "content": "Give me random markdown"
    }
  ],
  "stream": true
}'
```

## ⚙️ Environment Variables

Create a `.env` file in the root or `apps/gpt-auto-api/` directory:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `HTTP_PORT` | Port for the HTTP API | `8766` |
| `WS_PORT` | Port for the WebSocket server | `8765` |

## 🏗 Architecture

1. **Express Server**: Exposes standard OpenAI, Anthropic, and SSE endpoints.
2. **WebSocket Server**: Manages connections to the Browcall Extension.
3. **SSE Utility**: Handles live streaming deltas and protocol event formatting.
