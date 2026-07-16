import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { Context } from 'hono'
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
import type { IncomingMessage } from './integrations/types'
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
}

type SessionUser = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>['user'] | null
type BaseSession = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>['session']
// Extend base session with org plugin field so tenantMiddleware can access it
type SessionObj = (BaseSession & { activeOrganizationId?: string | null }) | null

type WebhookPayload = {
  externalCustomerId?: string
  customerId?: string
  customerEmail?: string
  email?: string
  customerPhone?: string
  phone?: string
  customerName?: string
  name?: string
  externalId?: string
  ticketId?: string
  subject?: string
  title?: string
  text?: string
  body?: string
  channel?: string
}

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
  origin: (origin, c) => {
    const allowed = [c.env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173']
    return allowed.includes(origin) ? origin : null
  },
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

app.post('/api/webhooks/telegram/:integrationId', handleWebhook)
app.post('/api/webhooks/:integrationId', handleWebhook)

async function handleWebhook(c: Context<AppEnv>) {
  const integrationId = c.req.param('integrationId')
  const integration = await c.env.DB.prepare(
    'SELECT id, organization_id, type, config FROM integrations WHERE id = ? AND enabled = 1'
  ).bind(integrationId).first<{ id: string; organization_id: string; type: string; config: string }>()

  if (!integration) return c.json({ error: 'Not found' }, 404)

  const body = await readWebhookBody(c)
  if (!body || typeof body !== 'object') return c.json({ error: 'Invalid webhook payload' }, 400)

  const incoming =
    integration.type === 'telegram'
      ? parseTelegramUpdate(body) ?? parseGenericWebhook(body)
      : integration.type === 'webhook'
        ? parseGenericWebhook(body)
        : null

  if (!incoming) return c.json({ error: 'Invalid webhook payload' }, 400)

  await c.env.QUEUE.send({
    type: 'inbound',
    integrationId: integration.id,
    organizationId: integration.organization_id,
    incoming,
  })

  return c.json({ ok: true })
}

async function readWebhookBody(c: Context<AppEnv>) {
  const contentType = c.req.header('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return c.req.json().catch(() => null)
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await c.req.formData().catch(() => null)
    if (!form) return null
    return Object.fromEntries(
      Array.from(form.entries()).map(([key, value]) => [key, String(value)]),
    )
  }

  const raw = await c.req.text().catch(() => '')
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return { text: raw }
  }
}

function parseGenericWebhook(body: WebhookPayload | Record<string, string>): IncomingMessage | null {
  const text = [body.text, body.body, body.subject, body.title].find(
    (value): value is string => Boolean(value?.trim()),
  )
  if (!text) return null

  const externalCustomerId =
    body.externalCustomerId ??
    body.customerId ??
    body.customerEmail ??
    body.email ??
    body.customerPhone ??
    body.phone ??
    body.externalId ??
    body.ticketId ??
    null

  if (!externalCustomerId) return null

  return {
    externalId: body.externalId ?? body.ticketId ?? externalCustomerId,
    externalCustomerId,
    customerName:
      body.customerName ?? body.name ?? body.customerEmail ?? body.email ?? 'Unknown customer',
    customerEmail: body.customerEmail ?? body.email,
    customerPhone: body.customerPhone ?? body.phone,
    subject: body.subject ?? body.title,
    text,
    channel: body.channel ?? 'webhook',
  }
}

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
