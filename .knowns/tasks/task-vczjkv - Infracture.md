---
id: vczjkv
title: Infracture
status: todo
priority: medium
labels: []
createdAt: '2026-01-12T14:18:29.781Z'
updatedAt: '2026-01-12T14:18:29.781Z'
timeSpent: 0
---
# Infracture

## Description

This document outlines the architecture and communication flow between the `extension` and `gpt-auto-api` components, as well as the internal messaging within the extension itself.

## Architecture Overview

The system consists of three main components:

1.  **`apps/extension`**: A browser extension that provides the user interface and interacts with web pages. It has a popup, a background service worker, and content scripts.
2.  **`apps/gpt-auto-api`**: A backend service built with Express.js. It provides an HTTP API for tasks like chat completions. It runs on port 8766 by default.
3.  **WebSocket Server (Presumed)**: The extension's `WSSingleton` class is configured to connect to a WebSocket server at `ws://localhost:8765`. This is likely a separate process, possibly the `n8n-nodes-browcall-gate`, which acts as a bridge or proxy.

## Communication Flow

### Extension to Backend Communication

*   The primary communication between the browser extension and the backend is handled via a **WebSocket** connection.
*   The `WSSingleton` class in `apps/extension/src/common/ws-singleton.ts` manages this connection.
*   The extension sends and receives JSON-formatted messages through this WebSocket.

### Inter-component Communication (Window Messaging)

Communication between the different parts of the browser extension (e.g., popup, background script, content scripts) is handled using `chrome.runtime.onMessage`. The `apps/extension/src/background.ts` script acts as a central message broker and session manager.

The following message types (defined in `ConnectWindowEnum`) are used:

*   `ConnectWindowEnum.NewSession`: Sent to the background script to create a new session for a browser tab. The payload includes the `apiPort` and `socketPort`.
*   `ConnectWindowEnum.GetSession`: Sent to retrieve the session information for a specific tab.
*   `ConnectWindowEnum.Disconnect`: Sent to terminate a session for a tab. The background script then notifies the relevant components that the session has been disconnected.
*   `ConnectWindowEnum.GetTabId`: Used to request the tab ID from the sender's context.
*   `ConnectWindowEnum.PollingSession`: Allows a component to check for the existence of a session.

### `gpt-auto-api` Service

*   The `gpt-auto-api` service, located in `apps/gpt-auto-api`, is a standard HTTP server.
*   It exposes API endpoints under the `/v1/chat/completions` route.
*   It does **not** handle WebSocket connections directly. It receives requests that are likely proxied from the WebSocket server.