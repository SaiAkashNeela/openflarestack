export class ConversationRoom implements DurableObject {
  private readonly state: DurableObjectState
  private sessions = new Set<WebSocket>()

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const payload = await request.json()
      const dead: WebSocket[] = []
      for (const ws of this.sessions) {
        try {
          ws.send(JSON.stringify(payload))
        } catch {
          dead.push(ws)
        }
      }
      dead.forEach((ws) => this.sessions.delete(ws))
      return new Response(null, { status: 204 })
    }

    const upgrade = request.headers.get('Upgrade')
    if (upgrade !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }

    const { 0: client, 1: server } = new WebSocketPair()
    server.accept()
    this.sessions.add(server)

    server.addEventListener('close', () => this.sessions.delete(server))
    server.addEventListener('error', () => this.sessions.delete(server))

    server.addEventListener('message', (evt) => {
      // Forward typing indicators + presence to peers
      let data: { type?: string } = {}
      try {
        data = JSON.parse(evt.data as string)
      } catch {
        return
      }
      if (data.type === 'typing' || data.type === 'presence') {
        for (const peer of this.sessions) {
          if (peer !== server) {
            try {
              peer.send(evt.data as string)
            } catch {
              /* dead peer */
            }
          }
        }
      }
    })

    return new Response(null, { status: 101, webSocket: client })
  }
}
