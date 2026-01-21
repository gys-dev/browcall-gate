# GPT Auto API

GPT Auto API is the backend component of the GPT Inner Call project. It provides an OpenAI-compatible interface that bridges external requests to the Browcall Extension for processing.

## 🚀 Features

- **OpenAI Compatible**: Implements the `/v1/chat/completions` specification.
- **WebSocket Communication**: Maintains a persistent connection with the browser extension to forward requests.
- **Streaming Support**: Supports Server-Sent Events (SSE) for real-time response streaming.
- **Flexible Output**: Support for different output formats (text, markdown, JSON).

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

### Chat Completions

Forwards a chat request to the connected browser extension.

**URL**: `/v1/chat/completions`  
**Method**: `POST`  
**Content-Type**: `application/json`

#### Request Body

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `messages` | `Array` | Yes | An array of message objects. Each object must have `role` (user/assistant) and `content`. |
| `outputFormat` | `string` | No | Desired format. Options: `markdown`, `json`, `text`. Default: `text`. |
| `stream` | `boolean` | No | Whether to stream the response using SSE. |

#### Request Example (cURL)

```bash
curl --location 'http://localhost:8766/v1/chat/completions' \
--header 'Content-Type: application/json' \
--data '{
  "messages": [
    {
      "role": "user",
      "content": "Give me random markdown"
    }
  ],
  "outputFormat": "markdown"
}'
```

#### Response Example (Success)

```json
{
  "data": {
    "text": "### Here is some markdown\n- Item 1\n- Item 2"
  }
}
```

## ⚙️ Environment Variables

Create a `.env` file in the root or `apps/gpt-auto-api/` directory:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `HTTP_PORT` | Port for the HTTP API | `8766` |
| `WS_PORT` | Port for the WebSocket server | `8765` |

## 🏗 Architecture

1. **Express Server**: Handles incoming HTTP requests.
2. **WebSocket Server**: Manages connections from the Browcall Extension.
3. **SSE Helper**: Manages streaming responses to the client.
4. **Validation Middleware**: Ensures requests meet the required schema.
