import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppEnv } from '../index'
import { nanoid } from '../lib/id'
import { parseGenericWebhook } from '../integrations/webhook'
import {
  readWebChatIntegrationConfig,
  signWebChatSessionToken,
  verifyWebChatSessionToken,
  webChatScript,
} from '../integrations/webchat'

const route = new Hono<AppEnv>()

route.get('/webchat/widget.js', async (c) => {
  const widgetKey = c.req.query('widgetKey')
  if (!widgetKey) return c.text('widgetKey required', 400)
  const baseUrl = c.req.query('baseUrl') ?? c.env.FRONTEND_URL
  return c.body(webChatScript(baseUrl, widgetKey), 200, {
    'content-type': 'application/javascript; charset=utf-8',
    'cache-control': 'no-store',
  })
})

route.post('/webchat/:widgetKey/session', async (c) => {
  const widgetKey = c.req.param('widgetKey')
  const body = (await c.req.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
  const integration = await findWebChatIntegration(c, widgetKey)
  if (!integration) return c.json({ error: 'Not found' }, 404)

  const visitorId =
    typeof body.visitorId === 'string' && body.visitorId.trim()
      ? body.visitorId.trim()
      : nanoid()

  const conversation = await upsertWebChatConversation(c, integration, visitorId, body)
  const messages = await loadConversationMessages(c, conversation.id)
  const token = await signWebChatSessionToken(c.env, integration.id, visitorId, conversation.id)

  return c.json({
    conversationId: conversation.id,
    visitorId,
    token,
    messages,
  })
})

route.post('/webchat/:widgetKey/messages', async (c) => {
  const widgetKey = c.req.param('widgetKey')
  const body = (await c.req.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
  const integration = await findWebChatIntegration(c, widgetKey)
  if (!integration) return c.json({ error: 'Not found' }, 404)

  const token = typeof body.token === 'string' ? body.token : ''
  const session = await verifyWebChatSessionToken(c.env, token)
  if (!session || session.integrationId !== integration.id) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!content) return c.json({ error: 'content required' }, 400)

  await c.env.QUEUE.send({
    type: 'inbound',
    integrationId: integration.id,
    organizationId: integration.organization_id,
    incoming: {
      externalId: `${session.visitorId}:${Date.now()}`,
      externalCustomerId: session.visitorId,
      customerName: typeof body.customerName === 'string' && body.customerName.trim() ? body.customerName.trim() : 'Visitor',
      customerEmail: typeof body.customerEmail === 'string' ? body.customerEmail : undefined,
      text: content,
      channel: 'webchat',
      conversationId: session.conversationId,
      metadata: {
        visitorId: session.visitorId,
        pageUrl: typeof body.pageUrl === 'string' ? body.pageUrl : undefined,
        origin: typeof body.origin === 'string' ? body.origin : undefined,
      },
    },
  })

  return c.json({ ok: true }, 202)
})

route.get('/ws/:conversationId', async (c) => {
  const token = c.req.query('token') ?? ''
  const session = await verifyWebChatSessionToken(c.env, token)
  if (!session || session.conversationId !== c.req.param('conversationId')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const id = c.env.CONVERSATION_ROOM.idFromName(c.req.param('conversationId'))
  const room = c.env.CONVERSATION_ROOM.get(id)
  return room.fetch(c.req.raw)
})

async function findWebChatIntegration(c: Context<AppEnv>, widgetKey: string) {
  const { results } = await c.env.DB.prepare(
    `SELECT id, organization_id, config
     FROM integrations
     WHERE enabled = 1 AND type = ?`,
  )
    .bind('webchat')
    .all<{ id: string; organization_id: string; config: string }>()

  return results.find((integration) => readWebChatIntegrationConfig(integration.config).widgetKey === widgetKey) ?? null
}

async function upsertWebChatConversation(
  c: Context<AppEnv>,
  integration: { id: string; organization_id: string },
  visitorId: string,
  body: Record<string, unknown>,
) {
  const externalId = `webchat:${visitorId}`
  const name =
    typeof body.customerName === 'string' && body.customerName.trim()
      ? body.customerName.trim()
      : 'Visitor'
  const email = typeof body.customerEmail === 'string' ? body.customerEmail : null
  const customerId = await ensureWebChatCustomer(c, integration.organization_id, visitorId, name, email)
  const convId = nanoid()
  await c.env.DB.prepare(
    `INSERT INTO conversations
     (id, organization_id, customer_id, integration_id, external_id, channel, status, subject, last_message_at)
     VALUES (?, ?, ?, ?, ?, 'webchat', 'open', ?, unixepoch())
     ON CONFLICT(organization_id, external_id) DO UPDATE SET
       last_message_at = unixepoch(),
       status = 'open',
       updated_at = unixepoch()`,
  )
    .bind(
      convId,
      integration.organization_id,
      customerId,
      integration.id,
      externalId,
      typeof body.subject === 'string' ? body.subject : null,
    )
    .run()

  const conversation = await c.env.DB.prepare(
    'SELECT id FROM conversations WHERE organization_id = ? AND external_id = ?',
  )
    .bind(integration.organization_id, externalId)
    .first<{ id: string }>()

  if (!conversation) throw new Error('Conversation upsert failed')
  return conversation
}

async function ensureWebChatCustomer(
  c: Context<AppEnv>,
  organizationId: string,
  visitorId: string,
  name: string,
  email: string | null,
) {
  const externalId = `webchat:${visitorId}`
  const existing = await c.env.DB.prepare(
    'SELECT id FROM customers WHERE organization_id = ? AND external_id = ?',
  )
    .bind(organizationId, externalId)
    .first<{ id: string }>()

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE customers SET name = ?, email = COALESCE(?, email), updated_at = unixepoch()
       WHERE id = ? AND organization_id = ?`,
    )
      .bind(name, email, existing.id, organizationId)
      .run()
    return existing.id
  }

  const id = nanoid()
  await c.env.DB.prepare(
    `INSERT INTO customers (id, organization_id, name, external_id, email)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, organizationId, name, externalId, email)
    .run()
  return id
}

async function loadConversationMessages(c: Context<AppEnv>, conversationId: string) {
  const { results } = await c.env.DB.prepare(
    'SELECT id, sender_type, sender_id, content, content_type, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
  )
    .bind(conversationId)
    .all()
  return results
}

route.post('/webhook/:integrationId', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body) return c.json({ error: 'Invalid webhook payload' }, 400)
  const incoming = parseGenericWebhook(body)
  if (!incoming) return c.json({ error: 'Invalid webhook payload' }, 400)
  const integration = await c.env.DB.prepare(
    'SELECT id, organization_id FROM integrations WHERE id = ? AND enabled = 1',
  )
    .bind(c.req.param('integrationId'))
    .first<{ id: string; organization_id: string }>()
  if (!integration) return c.json({ error: 'Not found' }, 404)
  await c.env.QUEUE.send({
    type: 'inbound',
    integrationId: integration.id,
    organizationId: integration.organization_id,
    incoming,
  })
  return c.json({ ok: true })
})

export default route
