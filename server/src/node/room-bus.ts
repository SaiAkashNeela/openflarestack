import Redis from 'ioredis'
import { randomUUID } from 'node:crypto'

type RoomHandler = (message: string) => void | Promise<void>

type BusEnvelope = {
  sourceId: string
  message: string
}

export type RoomBus = {
  subscribe(channel: string, handler: RoomHandler): Promise<() => Promise<void>>
  publish(channel: string, message: string): Promise<void>
  close(): Promise<void>
}

export function createRoomBus(redisUrl: string): RoomBus {
  const subscriber = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  })
  const publisher = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  })
  const instanceId = randomUUID()
  const handlers = new Map<string, Set<RoomHandler>>()

  subscriber.on('message', (channel, raw) => {
    const envelope = parseEnvelope(raw)
    if (!envelope || envelope.sourceId === instanceId) return
    const channelHandlers = handlers.get(channel)
    if (!channelHandlers?.size) return
    for (const handler of channelHandlers) {
      void Promise.resolve(handler(envelope.message)).catch((error) => {
        console.error('Room bus handler error', {
          channel,
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }
  })

  subscriber.on('error', (error) => {
    console.error('Room bus subscriber error', error)
  })

  publisher.on('error', (error) => {
    console.error('Room bus publisher error', error)
  })

  return {
    async subscribe(channel: string, handler: RoomHandler) {
      let channelHandlers = handlers.get(channel)
      const shouldSubscribe = !channelHandlers
      if (!channelHandlers) {
        channelHandlers = new Set()
        handlers.set(channel, channelHandlers)
      }
      channelHandlers.add(handler)
      if (shouldSubscribe) {
        await subscriber.subscribe(channel)
      }

      return async () => {
        const currentHandlers = handlers.get(channel)
        if (!currentHandlers) return
        currentHandlers.delete(handler)
        if (currentHandlers.size > 0) return
        handlers.delete(channel)
        await subscriber.unsubscribe(channel)
      }
    },

    async publish(channel: string, message: string) {
      const envelope: BusEnvelope = { sourceId: instanceId, message }
      await publisher.publish(channel, JSON.stringify(envelope))
    },

    async close() {
      handlers.clear()
      await Promise.allSettled([subscriber.quit(), publisher.quit()])
    },
  }
}

function parseEnvelope(value: string) {
  try {
    const parsed = JSON.parse(value) as Partial<BusEnvelope>
    if (typeof parsed.sourceId !== 'string' || typeof parsed.message !== 'string') {
      return null
    }
    return parsed as BusEnvelope
  } catch {
    return null
  }
}
