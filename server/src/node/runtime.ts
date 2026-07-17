import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RawData, WebSocket as NodeWebSocket } from 'ws'
import { WebSocket } from 'ws'
import type { Env } from '../index'
import { createPostgresDatabase, type SqlDatabase } from '../lib/postgres-db'
import { createObjectStorage } from '../lib/object-storage'
import { createBullMqQueue } from './bullmq-queue'
import { createRoomBus } from './room-bus'

type LocalRoomKind = 'conversation' | 'notification'

type RoomMessage = {
  type?: string
  [key: string]: unknown
}

const HEARTBEAT_INTERVAL_MS = 30_000

export async function createNodeRuntime(options: { port: number }) {
  const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const dataDir = process.env.FLAREDESK_DATA_DIR ?? join(serverDir, '.data')
  const redisUrl = process.env.REDIS_URL?.trim() || 'redis://127.0.0.1:6379/0'

  await mkdir(dataDir, { recursive: true })

  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) {
    throw new Error('DATABASE_URL is required')
  }

  const db: SqlDatabase = await createPostgresDatabase({
    connectionString,
    migrationsDir: join(serverDir, 'src/db/migrations'),
  })

  let runtimeEnv!: Env
  const queue = createBullMqQueue({
    redisUrl,
    getEnv: () => runtimeEnv,
    concurrency: Number(process.env.QUEUE_CONCURRENCY ?? 5),
  })
  const roomBus = createRoomBus(redisUrl)
  const rooms = {
    conversations: new LocalRoomNamespace('conversation', roomBus),
    notifications: new LocalRoomNamespace('notification', roomBus),
  }
  const storage = createObjectStorage(
    process.env.OBJECT_STORAGE_PROVIDER === 's3'
      ? {
          provider: 's3',
          bucket: process.env.OBJECT_STORAGE_BUCKET?.trim() ?? '',
          region: process.env.OBJECT_STORAGE_REGION?.trim() || 'us-east-1',
          endpoint: process.env.OBJECT_STORAGE_ENDPOINT?.trim() || undefined,
          accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim(),
          secretAccessKey:
            process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim() || process.env.AWS_SECRET_ACCESS_KEY?.trim(),
          forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE?.trim()
            ? process.env.OBJECT_STORAGE_FORCE_PATH_STYLE.trim() !== 'false'
            : true,
        }
      : {
          provider: 'local',
          rootDir: join(dataDir, 'objects'),
        },
  )
  const secretPath = join(dataDir, 'auth.secret')
  const webchatSecretPath = join(dataDir, 'webchat.secret')

  const betterAuthSecret = await readOrCreateSecret(secretPath, process.env.BETTER_AUTH_SECRET)
  const webchatSecret = await readOrCreateSecret(webchatSecretPath, process.env.WEBCHAT_SECRET, betterAuthSecret)

  runtimeEnv = {
    DB: db as unknown as Env['DB'],
    CONVERSATION_ROOM: rooms.conversations as unknown as Env['CONVERSATION_ROOM'],
    NOTIFICATION_ROOM: rooms.notifications as unknown as Env['NOTIFICATION_ROOM'],
    QUEUE: queue as unknown as Env['QUEUE'],
    STORAGE: storage as unknown as Env['STORAGE'],
    EMAIL: new ConsoleEmailBinding() as unknown as Env['EMAIL'],
    ENVIRONMENT: process.env.ENVIRONMENT ?? 'development',
    FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    BETTER_AUTH_SECRET: betterAuthSecret,
    BETTER_AUTH_URL:
      process.env.BETTER_AUTH_URL ?? `http://127.0.0.1:${options.port}`,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    WEBCHAT_SECRET: webchatSecret,
    GITHUB_APP_ID: process.env.GITHUB_APP_ID,
    GITHUB_PRIVATE_KEY: process.env.GITHUB_PRIVATE_KEY,
  }

  return {
    env: runtimeEnv,
    db,
    dataDir,
    rooms,
    queue,
    storage,
  }
}

class LocalRoomNamespace {
  private readonly rooms = new Map<string, LocalRoom>()
  private readonly kind: LocalRoomKind
  private readonly bus: ReturnType<typeof createRoomBus>

  constructor(kind: LocalRoomKind, bus: ReturnType<typeof createRoomBus>) {
    this.kind = kind
    this.bus = bus
  }

  idFromName(name: string) {
    return name
  }

  get(id: string) {
    return this.room(String(id))
  }

  attach(name: string, socket: NodeWebSocket) {
    this.room(name).attach(socket)
  }

  async broadcast(name: string, payload: unknown) {
    await this.room(name).broadcast(payload)
  }

  private room(name: string) {
    const existing = this.rooms.get(name)
    if (existing) return existing

    const room = new LocalRoom(this.kind, name, this.bus)
    this.rooms.set(name, room)
    return room
  }
}

class LocalRoom {
  private readonly sockets = new Set<NodeWebSocket>()
  private heartbeatState = new WeakMap<NodeWebSocket, boolean>()
  private heartbeatTimer: NodeJS.Timeout | null = null
  private cleanupTimer: NodeJS.Timeout | null = null
  private subscription: (() => Promise<void>) | null = null
  private subscriptionPromise: Promise<void> | null = null
  private readonly kind: LocalRoomKind
  private readonly name: string
  private readonly bus: ReturnType<typeof createRoomBus>

  constructor(kind: LocalRoomKind, name: string, bus: ReturnType<typeof createRoomBus>) {
    this.kind = kind
    this.name = name
    this.bus = bus
  }

  attach(socket: NodeWebSocket) {
    this.sockets.add(socket)
    this.heartbeatState.set(socket, true)
    this.cancelCleanup()
    void this.ensureSubscribed()

    socket.on('close', () => this.detach(socket))
    socket.on('error', () => this.detach(socket))
    socket.on('pong', () => {
      if (this.sockets.has(socket)) {
        this.heartbeatState.set(socket, true)
      }
    })

    if (this.kind === 'conversation') {
      socket.on('message', (data) => {
        const text = bufferToString(data)
        if (!text) return
        let parsed: RoomMessage
        try {
          parsed = JSON.parse(text) as RoomMessage
        } catch {
          return
        }
        if (parsed.type === 'typing' || parsed.type === 'presence') {
          void this.broadcastRaw(text, socket, true)
        }
      })
    }

    this.ensureHeartbeat()
  }

  async fetch(request: Request) {
    const url = new URL(request.url)

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const payload = await request.json()
      await this.broadcast(payload)
      return new Response(null, { status: 204 })
    }

    return new Response('Expected WebSocket', { status: 426 })
  }

  async broadcast(payload: unknown) {
    await this.broadcastRaw(JSON.stringify(payload), undefined, true)
  }

  private async broadcastRaw(text: string, exclude?: NodeWebSocket, publish = false) {
    const dead: NodeWebSocket[] = []
    for (const socket of this.sockets) {
      if (socket === exclude) continue
      if (socket.readyState !== WebSocket.OPEN) {
        dead.push(socket)
        continue
      }
      try {
        socket.send(text)
      } catch {
        dead.push(socket)
      }
    }
    for (const socket of dead) {
      this.detach(socket)
    }
    if (publish) {
      await this.bus.publish(this.channelName(), text)
    }
  }

  private detach(socket: NodeWebSocket) {
    this.sockets.delete(socket)
    this.heartbeatState.delete(socket)
    if (this.sockets.size === 0) {
      this.stopHeartbeat()
      this.scheduleCleanup()
    }
  }

  private clear() {
    for (const socket of this.sockets) {
      try {
        socket.close()
      } catch {
        socket.terminate()
      }
    }
    this.sockets.clear()
    this.heartbeatState = new WeakMap<NodeWebSocket, boolean>()
    this.stopHeartbeat()
  }

  private ensureHeartbeat() {
    if (this.heartbeatTimer) return

    this.heartbeatTimer = setInterval(() => {
      if (this.sockets.size === 0) {
        this.stopHeartbeat()
        return
      }

      for (const socket of this.sockets) {
        if (socket.readyState !== WebSocket.OPEN) {
          this.detach(socket)
          continue
        }

        const alive = this.heartbeatState.get(socket) ?? true
        if (!alive) {
          socket.terminate()
          this.detach(socket)
          continue
        }

        this.heartbeatState.set(socket, false)
        try {
          socket.ping()
        } catch {
          socket.terminate()
          this.detach(socket)
        }
      }
    }, HEARTBEAT_INTERVAL_MS)

    this.heartbeatTimer.unref?.()
  }

  private stopHeartbeat() {
    if (!this.heartbeatTimer) return
    clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  private scheduleCleanup() {
    if (this.cleanupTimer) return
    this.cleanupTimer = setTimeout(() => {
      this.cleanupTimer = null
      if (this.sockets.size > 0) return
      void this.releaseSubscription()
    }, 30_000)
    this.cleanupTimer.unref?.()
  }

  private cancelCleanup() {
    if (!this.cleanupTimer) return
    clearTimeout(this.cleanupTimer)
    this.cleanupTimer = null
  }

  private async ensureSubscribed() {
    if (this.subscription || this.subscriptionPromise) return this.subscriptionPromise ?? Promise.resolve()
    this.subscriptionPromise = this.bus
      .subscribe(this.channelName(), async (message) => {
        await this.broadcastRaw(message)
      })
      .then((unsubscribe) => {
        this.subscription = unsubscribe
      })
      .finally(() => {
        this.subscriptionPromise = null
      })
    return this.subscriptionPromise
  }

  private async releaseSubscription() {
    if (this.subscriptionPromise) {
      await this.subscriptionPromise.catch(() => undefined)
    }
    if (!this.subscription || this.sockets.size > 0) return
    const unsubscribe = this.subscription
    this.subscription = null
    await unsubscribe()
  }

  private channelName() {
    return `room:${this.kind}:${this.name}`
  }
}

class ConsoleEmailBinding {
  async send(message: {
    to: string | { email: string; name?: string }
    from: string | { email: string; name?: string }
    subject: string
    text?: string
    html?: string
    replyTo?: string | { email: string; name?: string }
  }) {
    console.log('[email]', {
      to: message.to,
      from: message.from,
      subject: message.subject,
      text: message.text?.slice(0, 200),
      html: message.html ? '[html omitted]' : undefined,
    })
    return { messageId: randomUUID() }
  }
}

async function readOrCreateSecret(filePath: string, fallback?: string, inherited?: string) {
  if (fallback?.trim()) return fallback.trim()
  if (inherited?.trim()) return inherited.trim()

  try {
    return (await readFile(filePath, 'utf8')).trim()
  } catch {
    const secret = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
    await writeFile(filePath, `${secret}\n`)
    return secret
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
