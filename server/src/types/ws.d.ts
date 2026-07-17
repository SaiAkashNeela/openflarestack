declare module 'ws' {
  import type { IncomingMessage } from 'node:http'
  import type { Socket } from 'node:net'

  export type RawData = string | Buffer | ArrayBuffer | Buffer[]

  export class WebSocket {
    static readonly OPEN: number
    readonly readyState: number
    send(data: RawData): void
    close(code?: number, reason?: string): void
    terminate(): void
    ping(data?: RawData, mask?: boolean, cb?: (err?: Error) => void): void
    on(event: 'close', listener: () => void): this
    on(event: 'error', listener: (error: Error) => void): this
    on(event: 'message', listener: (data: RawData) => void): this
    on(event: 'pong', listener: (data: RawData) => void): this
  }

  export class WebSocketServer {
    constructor(options?: { noServer?: boolean })
    handleUpgrade(
      request: IncomingMessage,
      socket: Socket,
      head: Buffer,
      callback: (ws: WebSocket) => void,
    ): void
  }
}
