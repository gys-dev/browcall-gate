import WebSocket, { WebSocketServer as WSServer } from 'ws';
import { randomUUID } from 'crypto';
import { CommuteEvent, WSPayload } from "interfaces"

interface WSRequest {
  uuid: string;
  text: string;
  initialContext?: {
    system: string;
    initialUser: string;
  };
  outputFormat: string;
}

interface WSChatResponse {
  text: string;
  uuid: string;
}

type MessageType = 'answer' | 'stop' | 'register';

type WSCallback = (type: MessageType, response: string, uuid?: string) => void;

const REQUEST_TIMEOUT_MS = 300_000;
const NEXT_DISPATCH_DELAY_MS = 300;

interface PendingRequest {
  targetUuid: string;
  callback: WSCallback;
  listener: (message: WebSocket.RawData) => void;
  timeoutHandle: NodeJS.Timeout;
}

// A request that arrived while its target connection was already busy with
// another request. It waits here until the connection frees up.
interface QueuedRequest {
  request: WSPayload<WSRequest>;
  targetUuid: string;
  callback: WSCallback;
}

/**
 * Per-browser-connection state. Each connection owns its own pending
 * requests, response buffer, and queue — nothing is shared across
 * connections. Only ONE request is ever actually in flight (socket.send)
 * on a given connection at a time; the browser side can't multiplex.
 */
interface ConnectionState {
  id: string;
  socket: WebSocket;
  contextInitialized: boolean;
  finalTextMap: Map<string, string>;
  pendingRequests: Map<string, PendingRequest>;
  queue: QueuedRequest[];
}

export class WebSocketServer {
  private server: WSServer;
  private connections = new Map<string, ConnectionState>();

  constructor() {
    const port = process.env.WS_PORT ? Number(process.env.WS_PORT) : 8765;
    this.server = new WSServer({ port });
    this.initialize();
  }

  private initialize(): void {
    this.server.on('connection', (socket: WebSocket) => {
      const connectionId = randomUUID();
      const state: ConnectionState = {
        id: connectionId,
        socket,
        contextInitialized: false,
        finalTextMap: new Map(),
        pendingRequests: new Map(),
        queue: [],
      };
      this.connections.set(connectionId, state);

      console.log(`Browser connected (id: ${connectionId}), total connections: ${this.connections.size}`);

      this.listenCommuteEvent(state);

      console.log(`WebSocket server is running at ws://localhost:${(this.server.address() as any).port}`);
    });
  }

  private listenCommuteEvent(state: ConnectionState) {
    const { socket, id } = state;

    socket.on('close', () => {
      console.log(`Browser connection disconnected (id: ${id})`);
      this.cleanupConnection(state, 'Browser connection disconnected');
      this.connections.delete(id);
    });

    socket.on('message', (message) => {
      try {
        const jsonObject = JSON.parse(
          message.toString('utf8')
        ) as WSPayload<WSRequest>;

        switch (jsonObject.type) {
          case CommuteEvent.Register: {
            console.log("request register", jsonObject);
            socket.send(JSON.stringify({ type: CommuteEvent.RegisterResponse }));
            break;
          }
          default:
        }
      } catch (e) {
        console.error('Error parsing WS commute message:', e);
      }
    });
  }

  /**
   * Cancels every in-flight and queued request belonging to a single
   * connection (used when that connection's socket closes).
   */
  private cleanupConnection(state: ConnectionState, reason: string) {
    for (const [uuid, pending] of Array.from(state.pendingRequests.entries())) {
      clearTimeout(pending.timeoutHandle);
      state.socket.off('message', pending.listener);
      state.pendingRequests.delete(uuid);
      state.finalTextMap.delete(uuid);
      pending.callback('stop', reason, uuid);
    }

    // Requests that never even got dispatched because the connection died
    // while they were waiting in line
    for (const queued of state.queue) {
      queued.callback('stop', reason, queued.targetUuid);
    }
    state.queue = [];
  }

  // Centralized cleanup for a single finished/timed-out request. Once the
  // connection is free again, dispatch whatever is next in its queue
  // (if anything) — after a short delay so the browser has time to settle
  // before we send it the next request.
  private finishRequest(state: ConnectionState, targetUuid: string) {
    const pending = state.pendingRequests.get(targetUuid);
    if (!pending) return;

    clearTimeout(pending.timeoutHandle);
    state.socket.off('message', pending.listener);
    state.pendingRequests.delete(targetUuid);
    state.finalTextMap.delete(targetUuid);

    if (state.queue.length === 0) return;

    setTimeout(() => {
      const next = state.queue.shift();
      if (!next) return;

      if (state.socket.readyState === WebSocket.OPEN) {
        this.dispatch(state, next.request, next.targetUuid, next.callback);
      } else {
        next.callback('stop', 'api error: browser not connected', next.targetUuid);
      }
    }, NEXT_DISPATCH_DELAY_MS);
  }

  private listenMessageCallBack = (
    state: ConnectionState,
    targetUuid: string,
    message: WebSocket.RawData,
    callback: WSCallback
  ) => {
    try {
      const jsonObject = JSON.parse(
        message.toString('utf8')
      ) as WSPayload<WSChatResponse>;

      const msgUuid = jsonObject.data?.uuid;

      // Strictly require a matching uuid. A message with no uuid (or a
      // mismatched one) is never assumed to belong to this request —
      // previously a missing uuid was let through, which let stray/late
      // messages from a just-finished request on this same connection
      // bleed into the next one's buffer.
      if (msgUuid !== targetUuid) {
        return;
      }

      if (jsonObject.type === 'stop') {
        const text = state.finalTextMap.get(targetUuid) || jsonObject.data?.text || '';
        this.finishRequest(state, targetUuid);
        callback('stop', text, targetUuid);
      } else if (jsonObject.type === 'answer') {
        const text = jsonObject?.data?.text || '';
        state.finalTextMap.set(targetUuid, text);
        callback('answer', text, targetUuid);
      }
    } catch (e) {
      console.error('Error parsing WS message:', e);
    }
  };


  /**
   * Actually sends the request over the wire and starts tracking it.
   * Only ever called when the connection has no other request in flight.
   */
  private dispatch(
    state: ConnectionState,
    request: WSPayload<WSRequest>,
    targetUuid: string,
    callback: WSCallback
  ) {
    console.log(`Sending request to browser (connection: ${state.id}):`, request.type, 'uuid:', targetUuid);

    const { initialContext, ...requestData } = request.data;
    const outgoingRequest = {
      ...request,
      data: {
        ...requestData,
        text: state.contextInitialized && initialContext
          ? request.data.text
          : initialContext
            ? [initialContext.system, initialContext.initialUser]
                .filter(Boolean)
                .join('\n\n')
            : request.data.text,
      },
    };

    const listener = (message: WebSocket.RawData) => {
      this.listenMessageCallBack(state, targetUuid, message, callback);
    };

    const timeoutHandle = setTimeout(() => {
      console.warn(`Request timed out (connection: ${state.id}), uuid:`, targetUuid);
      const text = state.finalTextMap.get(targetUuid) || '';
      this.finishRequest(state, targetUuid);
      callback('stop', text || 'timeout waiting for browser response', targetUuid);
    }, REQUEST_TIMEOUT_MS);

    state.pendingRequests.set(targetUuid, {
      targetUuid,
      callback,
      listener,
      timeoutHandle,
    });

    state.socket.on('message', listener);
    state.socket.send(JSON.stringify(outgoingRequest));

    if (!state.contextInitialized && initialContext) {
      state.contextInitialized = true;
    }
  }

  /**
   * Picks a connection to use: prefers a fully idle one (nothing in flight).
   * If none are idle, picks whichever has the smallest total backlog
   * (in-flight + queued) — the new request will be queued behind it rather
   * than sent concurrently with another request on the same socket.
   */
  private pickBestConnection(): ConnectionState | null {
    let idle: ConnectionState | null = null;
    let leastBusy: ConnectionState | null = null;

    for (const state of this.connections.values()) {
      if (state.socket.readyState !== WebSocket.OPEN) continue;

      if (state.pendingRequests.size === 0) {
        if (!idle) idle = state;
        continue;
      }

      const load = state.pendingRequests.size + state.queue.length;
      const leastBusyLoad = leastBusy ? leastBusy.pendingRequests.size + leastBusy.queue.length : Infinity;
      if (load < leastBusyLoad) {
        leastBusy = state;
      }
    }

    return idle || leastBusy;
  }

  public sendRequest(request: WSPayload<WSRequest>, callback: WSCallback): void {
    const targetUuid = request.data?.uuid || '';

    if (!targetUuid) {
      callback('stop', 'api error: missing uuid', targetUuid);
      return;
    }

    const state = this.pickBestConnection();
    if (!state) {
      callback('stop', 'api error: no browser connected', targetUuid);
      return;
    }

    const alreadyTracked =
      state.pendingRequests.has(targetUuid) ||
      state.queue.some((q) => q.targetUuid === targetUuid);
    if (alreadyTracked) {
      callback('stop', 'api error: duplicate uuid already in flight', targetUuid);
      return;
    }

    if (state.pendingRequests.size === 0) {
      // Connection is free — send immediately
      this.dispatch(state, request, targetUuid, callback);
    } else {
      // Connection is busy with another request — wait our turn so the two
      // never overlap on the same socket
      console.log(`Connection ${state.id} busy, queuing request uuid: ${targetUuid}`);
      state.queue.push({ request, targetUuid, callback });
    }
  }

  /**
   * Cancels a specific request by uuid, whether it's currently in flight
   * or still waiting in a connection's queue.
   */
  public cancelRequest(targetUuid: string): void {
    for (const state of this.connections.values()) {
      if (state.pendingRequests.has(targetUuid)) {
        this.finishRequest(state, targetUuid);
        return;
      }

      const queueIndex = state.queue.findIndex((q) => q.targetUuid === targetUuid);
      if (queueIndex !== -1) {
        state.queue.splice(queueIndex, 1);
        return;
      }
    }
  }
}

let instance: WebSocketServer | null = null;
export const getWebsocketServerInstance = () => {
  if (!instance) {
    instance = new WebSocketServer();
  }
  return instance;
};