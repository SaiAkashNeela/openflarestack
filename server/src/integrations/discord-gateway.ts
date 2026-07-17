import { WebSocket } from 'ws'
import type { RawData } from 'ws'
import type { Env } from '../index'
import { parseDiscordMessage, readDiscordIntegrationConfig } from './discord'

type DiscordGatewaySessionInput = {
  integrationId: string
  organizationId: string
  config: Record<string, unknown>
}

type ParsedDiscordMessage = Exclude<ReturnType<typeof parseDiscordMessage>, null>

const sessions = new Map<string, DiscordGatewaySession>()

export async function startDiscordGateway(
  env: Pick<Env, 'QUEUE'>,
  integrationId: string,
  organizationId: string,
  config: Record<string, unknown>,
) {
  await stopDiscordGateway(integrationId)
  const session = new DiscordGatewaySession(env)
  sessions.set(integrationId, session)
  await session.start({ integrationId, organizationId, config })
}

export async function stopDiscordGateway(integrationId: string) {
  const session = sessions.get(integrationId)
  if (!session) return
  await session.stop()
  sessions.delete(integrationId)
}

class DiscordGatewaySession {
  private readonly env: Pick<Env, 'QUEUE'>
  private socket: any = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private heartbeatAckTimer: ReturnType<typeof setTimeout> | null = null
  private lastSeq: number | null = null
  private sessionId: string | null = null
  private resumeGatewayUrl: string | null = null
  private integrationId: string | null = null
  private organizationId: string | null = null
  private channelId: string | null = null
  private botToken: string | null = null
  private stopping = false

  constructor(env: Pick<Env, 'QUEUE'>) {
    this.env = env
  }

  async start(input: DiscordGatewaySessionInput) {
    this.stopping = false
    this.integrationId = input.integrationId
    this.organizationId = input.organizationId

    const config = readDiscordIntegrationConfig(JSON.stringify(input.config))
    this.channelId = config.channelId ?? null
    this.botToken = config.botToken ?? null
    await this.connectGateway()
  }

  async stop() {
    this.stopping = true
    await this.closeGateway()
  }

  private async connectGateway(resume = false) {
    if (!this.botToken || this.stopping) return
    await this.closeSocket()

    const gateway = await this.getGatewayUrl()
    const socket: any = new (WebSocket as any)(`${gateway}?v=10&encoding=json`)
    this.socket = socket

    socket.on('open', () => {
      // Wait for Hello before identifying/resuming.
    })

    socket.on('message', async (data: RawData) => {
      if (this.stopping) return
      let payload:
        | { op: 10; d: { heartbeat_interval: number } }
        | { op: 0; t: string; s: number; d: Record<string, unknown> }
        | { op: 7 }
        | { op: 9; d: boolean }
        | { op: 11 }
        | null = null
      try {
        payload = JSON.parse(bufferToString(data))
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

    socket.on('close', async () => {
      if (this.stopping) return
      await this.reconnect(Boolean(this.sessionId))
    })

    socket.on('error', async () => {
      if (this.stopping) return
      await this.reconnect(Boolean(this.sessionId))
    })
  }

  private async identifyOrResume(resume: boolean) {
    if (!this.socket || this.stopping) return
    if (resume && this.sessionId) {
      this.socket.send(
        JSON.stringify({
          op: 6,
          d: {
            token: this.botToken,
            session_id: this.sessionId,
            seq: this.lastSeq,
          },
        }),
      )
      return
    }

    this.socket.send(
      JSON.stringify({
        op: 2,
        d: {
          token: this.botToken,
          intents: (1 << 9) | (1 << 12) | (1 << 15),
          properties: {
            os: 'linux',
            browser: 'openflarestack',
            device: 'openflarestack',
          },
        },
      }),
    )
  }

  private async startHeartbeat(interval: number) {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket || this.stopping) return
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
    if (!this.botToken || this.stopping) return
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
    const data = (await res.json()) as { url?: string }
    return data.url ?? 'wss://gateway.discord.gg'
  }

  private async enqueueIncoming(incoming: ParsedDiscordMessage) {
    if (!this.integrationId || !this.organizationId) return
    await this.env.QUEUE.send({
      type: 'inbound',
      integrationId: this.integrationId,
      organizationId: this.organizationId,
      incoming,
    })
  }
}

function bufferToString(data: RawData) {
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  const view = data as ArrayBufferView
  return Buffer.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)).toString('utf8')
}
