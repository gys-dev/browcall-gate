// src/content/ws-singleton.ts
// Singleton WebSocket manager class for sharing and extending socket methods

import { WSPayload } from "interfaces";

export class WSSingleton {
  private static WS_URL = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_WS_URL
    ? import.meta.env.VITE_WS_URL
    : 'ws://localhost:8765';

  private static sharedSocket: WebSocket | null = null;
  private static port = 8765;

  static getSocket(): WebSocket {
    if (!this.sharedSocket || this.sharedSocket.readyState === WebSocket.CLOSED) {
      const urlSocket = `ws://localhost:${WSSingleton.port}`;
      this.sharedSocket = new WebSocket(urlSocket);
    }
    return this.sharedSocket;
  }

  static setSingletonPort(port: number) {
    WSSingleton.port = port
  }

  static onOpen(cb: (ev: Event) => void) {
    this.getSocket().addEventListener('open', cb);
  }

  static onMessage(cb: (ev: MessageEvent) => void) {
    this.getSocket().addEventListener('message', cb);
  }

  static onClose(cb: (ev: CloseEvent) => void) {
    this.getSocket().addEventListener('close', cb);
  }

  static onError(cb: (ev: Event) => void) {
    this.getSocket().addEventListener('error', cb);
  }

  static send<T>(data: WSPayload<T>) {
    const socket = this.getSocket();
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  static disconnect() {
    this.sharedSocket?.close()
    this.sharedSocket = null
  }

  static isConnected(): boolean {
    return this.sharedSocket?.readyState === WebSocket.OPEN;
  }

  static reconnect() {
    // return this.getSocket();
  }

}
