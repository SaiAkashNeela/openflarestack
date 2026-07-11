import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { Auth } from 'better-auth'
import { sessionMiddleware } from './middleware/session'
import { tenantMiddleware } from './middleware/tenant'
import conversationsRoute from './routes/conversations'
import messagesRoute from './routes/messages'
import customersRoute from './routes/customers'
import teamsRoute from './routes/teams'
import integrationsRoute from './routes/integrations'
import { queueConsumer } from './queues/consumer'
export { ConversationRoom } from './objects/ConversationRoom'

export type Env = {
  DB: D1Database
  CONVERSATION_ROOM: DurableObjectNamespace
  QUEUE: Queue
  R2: R2Bucket
  KV: KVNamespace
  ENVIRONMENT: string
  FRONTEND_URL: string
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
}

type SessionUser = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>['user'] | null
type BaseSession = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>['session']
// Extend base session with org plugin field so tenantMiddleware can access it
type SessionObj = (BaseSession & { activeOrganizationId?: string | null }) | null

export type AppEnv = {
  Bindings: Env
  Variables: {
    user: SessionUser
    session: SessionObj
    orgId: string | undefined
  }
}

const app = new Hono<AppEnv>()

app.use('*', logger())
app.use('*', cors({
  origin: (origin, c) => c.env.FRONTEND_URL,
  credentials: true,
}))

// Auth routes (handled by Better Auth)
app.on(['GET', 'POST'], '/api/auth/*', async (c) => {
  const { createAuth } = await import('./auth')
  return createAuth(c.env).handler(c.req.raw)
})

// Health check
app.get('/api/health', (c) => c.json({ ok: true }))

// Authenticated routes
app.use('/api/v1/*', sessionMiddleware)
app.use('/api/v1/*', tenantMiddleware)

app.route('/api/v1/conversations', conversationsRoute)
app.route('/api/v1/messages', messagesRoute)
app.route('/api/v1/customers', customersRoute)
app.route('/api/v1/teams', teamsRoute)
app.route('/api/v1/integrations', integrationsRoute)

// WebSocket upgrade → delegate to ConversationRoom DO
app.get('/api/v1/ws/:conversationId', async (c) => {
  const id = c.env.CONVERSATION_ROOM.idFromName(c.req.param('conversationId'))
  const room = c.env.CONVERSATION_ROOM.get(id)
  return room.fetch(c.req.raw)
})

export default {
  fetch: app.fetch,
  queue: queueConsumer,
} satisfies ExportedHandler<Env>
