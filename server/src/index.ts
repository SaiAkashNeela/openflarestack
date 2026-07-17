import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { Context } from 'hono'
import type { Auth } from 'better-auth'
import type { SqlDatabase } from './lib/postgres-db'
import type { ObjectStorage } from './lib/object-storage'
import { sessionMiddleware } from './middleware/session'
import { tenantMiddleware } from './middleware/tenant'
import conversationsRoute from './routes/conversations'
import messagesRoute from './routes/messages'
import customersRoute from './routes/customers'
import teamsRoute from './routes/teams'
import integrationsRoute from './routes/integrations'
import meRoute from './routes/me'
import uploadsRoute from './routes/uploads'
import eventsRoute from './routes/events'
import notificationsRoute from './routes/notifications'
import aiRoute from './routes/ai'
import publicRoute from './routes/public'
import { normalizeEmailAddress, parseIncomingEmail, readEmailIntegrationConfig } from './integrations/email'
import { parseTelegramUpdate } from './integrations/telegram'
import { parseGenericWebhook as parseWebhookPayload } from './integrations/webhook'
import { parseGitHubIssueWebhook, verifyGitHubWebhook, readGitHubIntegrationConfig } from './integrations/github'
import { parseDiscordMessage } from './integrations/discord'
import type { IncomingMessage } from './integrations/types'
import { isTrustedFrontendOrigin } from './lib/frontend-origin'

export type RoomHandle = {
  fetch(request: Request): Promise<Response>
}

export type RoomNamespace = {
  idFromName(name: string): string
  get(id: string): RoomHandle
}

export type JobQueue = {
  send(job: unknown): Promise<unknown>
  close(): Promise<void>
}

export type Env = {
  DB: SqlDatabase
  CONVERSATION_ROOM: RoomNamespace
  NOTIFICATION_ROOM: RoomNamespace
  QUEUE: JobQueue
  STORAGE: ObjectStorage
  EMAIL: {
    send(message: {
      to: string | { email: string; name?: string }
      from: string | { email: string; name?: string }
      subject: string
      text?: string
      html?: string
      replyTo?: string | { email: string; name?: string }
    }): Promise<{ messageId: string }>
  }
  ENVIRONMENT: string
  FRONTEND_URL: string
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  WEBCHAT_SECRET?: string
  GITHUB_APP_ID?: string
  GITHUB_PRIVATE_KEY?: string
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
    orgRole: string | undefined
  }
}

export const app = new Hono<AppEnv>()

app.use('*', logger())
app.use('*', cors({
  origin: (origin, c) => {
    const allowed =
      isTrustedFrontendOrigin(origin, c.env.FRONTEND_URL) ||
      origin === 'http://localhost:5173' ||
      origin === 'http://127.0.0.1:5173'
    return allowed ? origin : null
  },
  credentials: true,
}))

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
app.route('/api/v1/me', meRoute)
app.route('/api/v1/uploads', uploadsRoute)
app.route('/api/v1/events', eventsRoute)
app.route('/api/v1/notifications', notificationsRoute)
app.route('/api/v1/ai', aiRoute)
app.route('/api/public', publicRoute)

app.post('/api/auth/sign-up/email', handleSignup)
app.on(['GET', 'POST'], '/api/auth/*', handleAuthRequest)
app.post('/api/webhooks/telegram/:integrationId', handleWebhook)
app.post('/api/webhooks/:integrationId', handleWebhook)

async function handleSignup(c: Context<AppEnv>) {
  return handleAuthRequest(c)
}

async function handleAuthRequest(c: Context<AppEnv>) {
  const { createAuth } = await import('./auth')
  return createAuth(c.env).handler(c.req.raw)
}

async function handleWebhook(c: Context<AppEnv>) {
  const integrationId = c.req.param('integrationId')
  const integration = await c.env.DB.prepare(
    'SELECT id, organization_id, type, config FROM integrations WHERE id = ? AND enabled = 1'
  ).bind(integrationId).first<{ id: string; organization_id: string; type: string; config: string }>()

  if (!integration) return c.json({ error: 'Not found' }, 404)

  const request = await readWebhookBody(c)
  if (!request || typeof request.body !== 'object') return c.json({ error: 'Invalid webhook payload' }, 400)

  const incoming =
    integration.type === 'telegram'
      ? parseTelegramUpdate(request.body) ?? parseWebhookPayload(request.body)
      : integration.type === 'github'
        ? await handleGitHubWebhookPayload(integration, request, c)
      : integration.type === 'discord'
        ? parseDiscordMessage(request.body) ?? null
      : integration.type === 'webhook'
        ? parseWebhookPayload(request.body)
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

type ForwardableEmailMessage = {
  from: string
  to: string
  headers: Headers
  raw: ReadableStream
  rawSize: number
  setReject(reason: string): void
}

async function handleEmail(message: ForwardableEmailMessage, env: Env) {
  const recipient = normalizeEmailAddress(message.to)
  const { results } = await env.DB.prepare(
    'SELECT id, organization_id, config FROM integrations WHERE type = ? AND enabled = 1'
  ).bind('email').all<{ id: string; organization_id: string; config: string }>()

  const integration = results.find((item) => {
    const config = readEmailIntegrationConfig(item.config)
    return config.address ? normalizeEmailAddress(config.address) === recipient : false
  })

  if (!integration) {
    message.setReject(`No email integration is configured for ${message.to}`)
    return
  }

  const incoming = await parseIncomingEmail(message)
  if (!incoming) {
    message.setReject('Unable to parse email content')
    return
  }

  await env.QUEUE.send({
    type: 'inbound',
    integrationId: integration.id,
    organizationId: integration.organization_id,
    incoming,
  })
}

async function readWebhookBody(c: Context<AppEnv>) {
  const contentType = c.req.header('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const raw = await c.req.text().catch(() => '')
    if (!raw) return null
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return null
    }
    return {
      raw,
      body,
    }
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await c.req.formData().catch(() => null)
    if (!form) return null
    const body = Object.fromEntries(
      Array.from(form.entries()).map(([key, value]) => [key, String(value)]),
    )
    return { raw: JSON.stringify(body), body }
  }

  const raw = await c.req.text().catch(() => '')
  if (!raw) return null

  try {
    return { raw, body: JSON.parse(raw) }
  } catch {
    return { raw, body: { text: raw } }
  }
}

async function handleGitHubWebhookPayload(
  integration: { id: string; organization_id: string; config: string },
  request: { raw: string; body: Record<string, unknown> },
  c: Context<AppEnv>,
) {
  const config = readGitHubIntegrationConfig(integration.config)
  if (config.webhookSecret) {
    const signature = c.req.header('x-hub-signature-256')
    const ok = await verifyGitHubWebhook(config.webhookSecret, request.raw, signature)
    if (!ok) return null
  }
  return parseGitHubIssueWebhook(request.body) ?? parseWebhookPayload(request.body)
}

// WebSocket upgrade → delegate to the local room namespace
app.get('/api/v1/ws/:conversationId', async (c) => {
  const id = c.env.CONVERSATION_ROOM.idFromName(c.req.param('conversationId'))
  const room = c.env.CONVERSATION_ROOM.get(id)
  return room.fetch(c.req.raw)
})

export default {
  fetch: app.fetch,
  email: handleEmail,
}
