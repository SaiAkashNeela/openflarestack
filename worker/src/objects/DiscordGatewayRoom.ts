import type { Env } from '../index'
import { parseDiscordMessage, readDiscordIntegrationConfig } from '../integrations/discord'

type GatewayHello = { op: 10; d: { heartbeat_interval: number } }
type GatewayDispatch = { op: 0; t: string; s: number; d: Record<string, unknown> }
type GatewayReconnect = { op: 7 }
type GatewayInvalidSession = { op: 9; d: boolean }
type GatewayHeartbeatAck = { op: 11 }

export class DiscordGatewayRoom implements DurableObject {
  private readonly state: DurableObjectState
  private readonly env: Env
  private socket: WebSocket | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private heartbeatAckTimer: ReturnType<typeof setTimeout> | null = null
  private lastSeq: number | null = null
  private sessionId: string | null = null
  private resumeGatewayUrl: string | null = null
  private connected = false
  private integrationId: string | null = null
  private organizationId: string | null = null
  private channelId: string | null = null
  private botToken: string | null = null

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/start' && request.method === 'POST') {
      const body = await request.json<{
        integrationId: string
        organizationId: string
        channelId?: string
        botToken?: string
        config?: string
      }>()
      this.integrationId = body.integrationId
      this.organizationId = body.organizationId
      const config = readDiscordIntegrationConfig(body.config ?? '{}')
      this.channelId = body.channelId ?? config.channelId ?? null
      this.botToken = body.botToken ?? config.botToken ?? null
      await this.connectGateway()
      return new Response(null, { status: 204 })
    }

    if (url.pathname === '/stop' && request.method === 'POST') {
      await this.closeGateway()
      return new Response(null, { status: 204 })
    }

    return new Response('Not found', { status: 404 })
  }

  private async connectGateway(resume = false) {
    if (!this.botToken) return
    await this.closeSocket()

    const gateway = await this.getGatewayUrl()
    const ws = new WebSocket(`${gateway}?v=10&encoding=json`)
    this.socket = ws
    this.connected = false

    ws.addEventListener('open', () => {
      // Wait for Hello before identifying/resuming.
    })

    ws.addEventListener('message', async (event) => {
      let payload: GatewayHello | GatewayDispatch | GatewayReconnect | GatewayInvalidSession | GatewayHeartbeatAck | null = null
      try {
        payload = JSON.parse(event.data as string)
      } catch {
        return
      }
      if (!payload) return
      if (payload.op === 10) {
        await this.startHeartbeat(payload.d.heartbeat_interval)
        await this.identifyOrResume(resume)
        return
      }
      if (payload.op === 11) {
        if (this.heartbeatAckTimer) {
          clearTimeout(this.heartbeatAckTimer)
          this.heartbeatAckTimer = null
        }
        return
      }
      if (payload.op === 7) {
        await this.reconnect(true)
        return
      }
      if (payload.op === 9) {
        await this.reconnect(Boolean(payload.d))
        return
      }
      if (payload.op !== 0) return

      this.lastSeq = payload.s ?? this.lastSeq
      if (payload.t === 'READY') {
        const ready = payload.d as Record<string, unknown>
        this.sessionId = typeof ready.session_id === 'string' ? ready.session_id : this.sessionId
        this.resumeGatewayUrl =
          typeof ready.resume_gateway_url === 'string'
            ? ready.resume_gateway_url
            : this.resumeGatewayUrl
        this.connected = true
        return
      }

      if (payload.t === 'MESSAGE_CREATE') {
        const incoming = parseDiscordMessage({ t: payload.t, d: payload.d })
        if (incoming && this.channelId) {
          const data = payload.d
          const channelId = typeof data.channel_id === 'string' ? data.channel_id : ''
          if (!channelId || channelId !== this.channelId) return
          await this.enqueueIncoming(incoming)
        }
      }
    })

    ws.addEventListener('close', async () => {
      this.connected = false
      await this.reconnect(Boolean(this.sessionId))
    })

    ws.addEventListener('error', async () => {
      this.connected = false
      await this.reconnect(Boolean(this.sessionId))
    })
  }

  private async identifyOrResume(resume: boolean) {
    if (!this.socket) return
    if (resume && this.sessionId) {
      this.socket.send(JSON.stringify({
        op: 6,
        d: {
          token: this.botToken,
          session_id: this.sessionId,
          seq: this.lastSeq,
        },
      }))
      return
    }

    this.socket.send(JSON.stringify({
      op: 2,
      d: {
        token: this.botToken,
        intents: (1 << 9) | (1 << 12) | (1 << 15),
        properties: {
          os: 'cloudflare',
          browser: 'openflarestack',
          device: 'openflarestack',
        },
      },
    }))
  }

  private async startHeartbeat(interval: number) {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket) return
      if (this.heartbeatAckTimer) {
        this.socket.close(4000, 'missed heartbeat ack')
        return
      }
      this.socket.send(JSON.stringify({ op: 1, d: this.lastSeq }))
      this.heartbeatAckTimer = setTimeout(() => {
        this.socket?.close(4000, 'heartbeat timeout')
      }, interval * 2)
    }, interval)
  }

  private async reconnect(resume: boolean) {
    if (!this.botToken) return
    await this.closeSocket()
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await this.connectGateway(resume)
  }

  private async closeGateway() {
    await this.closeSocket()
    this.integrationId = null
    this.organizationId = null
    this.channelId = null
    this.botToken = null
    this.sessionId = null
    this.lastSeq = null
    this.resumeGatewayUrl = null
  }

  private async closeSocket() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.heartbeatAckTimer) {
      clearTimeout(this.heartbeatAckTimer)
      this.heartbeatAckTimer = null
    }
    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        // ignore
      }
      this.socket = null
    }
  }

  private async getGatewayUrl() {
    const res = await fetch('https://discord.com/api/gateway/bot', {
      headers: this.botToken ? { Authorization: `Bot ${this.botToken}` } : undefined,
    })
    if (!res.ok) {
      return 'wss://gateway.discord.gg'
    }
    const data = await res.json() as { url?: string }
    return data.url ?? 'wss://gateway.discord.gg'
  }

  private async enqueueIncoming(incoming: ReturnType<typeof parseDiscordMessage> extends infer T ? Exclude<T, null> : never) {
    if (!this.integrationId || !this.organizationId) return
    await this.env.QUEUE.send({
      type: 'inbound',
      integrationId: this.integrationId,
      organizationId: this.organizationId,
      incoming,
    })
  }
}
