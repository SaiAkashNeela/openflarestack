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
import { parseTelegramUpdate } from './integrations/telegram'
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

// Telegram webhook (no auth — verified by integration config lookup)
app.post('/api/webhooks/telegram/:integrationId', async (c) => {
  const integrationId = c.req.param('integrationId')
  const integration = await c.env.DB.prepare(
    'SELECT id, organization_id, config FROM integrations WHERE id = ? AND type = ? AND enabled = 1'
  ).bind(integrationId, 'telegram').first<{ id: string; organization_id: string; config: string }>()

  if (!integration) return c.json({ error: 'Not found' }, 404)

  const update = await c.req.json()
  const incoming = parseTelegramUpdate(update)
  if (!incoming) return c.json({ ok: true }) // non-message update, ack and ignore

  await c.env.QUEUE.send({
    type: 'inbound',
    integrationId: integration.id,
    organizationId: integration.organization_id,
    incoming,
  })

  return c.json({ ok: true })
})

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
