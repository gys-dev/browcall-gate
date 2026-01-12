import WebSocket, { WebSocketServer as WSServer } from 'ws';
import { CommuteEvent } from "interfaces"

const WS_PORT = process.env.WS_PORT ? Number(process.env.WS_PORT) : 8765;

interface WSRequest {
  text: string;
  outputFormat: string;
  newChat: boolean;
}

interface WSResponse {
  type: 'answer' | 'stop' | 'register';
  text: string;
}

type WSCallback = (type: WSResponse['type'], response: string) => void;


export class WebSocketServer {
  private server: WSServer;
  private connectedSocket: WebSocket | null = null;
  private text = "";

  constructor() {
    this.server = new WSServer({ port: WS_PORT });
    this.initialize();
  }

  private initialize(): void {
    this.server.on('connection', (socket: WebSocket) => {
      this.connectedSocket = socket;
      console.log('Browser connected, can process requests now.');

      this.listenCommuteEvent(socket)

      console.log('WebSocket server is running');
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
      ) as WSResponse;

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

  listenMessageCallBack = (message: WebSocket.RawData, callback: WSCallback) => {
    const jsonObject = JSON.parse(
      message.toString('utf8')
    ) as WSResponse;

    if (jsonObject.type === 'stop') {
      this.connectedSocket?.off('message', callback);
      callback('stop', this.text);
    } else if (jsonObject.type === 'answer') {
      this.text = jsonObject.text;
      callback('answer', this.text);
    }
  };

  public sendRequest(request: WSRequest, callback: WSCallback): void {
    if (!this.connectedSocket) {
      callback('stop', 'api error');
      return;
    }

    this.connectedSocket.send(JSON.stringify(request));
    this.connectedSocket.on('message', (message: WebSocket.RawData) => this.listenMessageCallBack(message, callback));
  }
}

export const websocketServerInstance = new WebSocketServer();