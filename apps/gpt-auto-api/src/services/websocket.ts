import WebSocket, { WebSocketServer as WSServer } from 'ws';
import { CommuteEvent, WSPayload } from "@interfaces"

interface WSRequest {
  text: string;
  outputFormat: string;
}

interface WSChatResponse {
  text: string;
}

type MessageType = 'answer' | 'stop' | 'register';

type WSCallback = (type: MessageType, response: string) => void;


export class WebSocketServer {
  private server: WSServer;
  private connectedSocket: WebSocket | null = null;
  private finalText = "";

  constructor() {
    const port = process.env.WS_PORT ? Number(process.env.WS_PORT) : 8765;
    this.server = new WSServer({ port });
    this.initialize();
  }

  private initialize(): void {
    this.server.on('connection', (socket: WebSocket) => {
      this.connectedSocket = socket;
      console.log('Browser connected, can process requests now.');

      this.listenCommuteEvent(socket)

      console.log(`WebSocket server is running at ws://localhost:${(this.server.address() as any).port}`);
    });

  }

  listenCommuteEvent = (socket: WebSocket) => {
    socket.on('close', () => {
      console.log(
        'The browser connection has been disconnected, the request cannot be processed.'
      );
      this.connectedSocket = null;
    });

    socket.on('message', (message) => {
      const jsonObject = JSON.parse(
        message.toString('utf8')
      ) as WSPayload<WSRequest>;

      switch (jsonObject.type) {
        case CommuteEvent.Register: {
          console.log("request register", jsonObject)
          socket.send(JSON.stringify({ type: CommuteEvent.RegisterResponse }))
          break;
        }

        default:

      }
    })

  }

  listenMessageCallBack = (message: WebSocket.RawData, callback: WSCallback, currentListener: (message: WebSocket.RawData) => void) => {
    try {
      const jsonObject = JSON.parse(
        message.toString('utf8')
      ) as WSPayload<WSChatResponse>;

      if (jsonObject.type === 'stop') {
        this.connectedSocket?.off('message', currentListener);
        callback('stop', this.finalText);
      } else if (jsonObject.type === 'answer') {
        this.finalText = jsonObject.data.text;
        callback('answer', this.finalText);
      }
    } catch (e) {
      console.error('Error parsing WS message:', e);
    }
  };

  public sendRequest(request: WSPayload<WSRequest>, callback: WSCallback): void {
    if (!this.connectedSocket) {
      callback('stop', 'api error');
      return;
    }

    console.log('Sending request to browser:', request.type);
    this.connectedSocket.send(JSON.stringify(request));

    const listener = (message: WebSocket.RawData) => {
      this.listenMessageCallBack(message, callback, listener);
    };

    this.connectedSocket.on('message', listener);
  }
}

let instance: WebSocketServer | null = null;
export const getWebsocketServerInstance = () => {
  if (!instance) {
    instance = new WebSocketServer();
  }
  return instance;
};