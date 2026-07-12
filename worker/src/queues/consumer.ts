import type { Env } from '../index'
import type { InboundJob, OutboundJob } from '../integrations/types'
import { sendTelegramMessage } from '../integrations/telegram'

type QueueJob = InboundJob | OutboundJob

export const queueConsumer: ExportedHandlerQueueHandler<Env> = async (batch, env) => {
  for (const msg of batch.messages) {
    try {
      await processJob(msg.body as QueueJob, env)
      msg.ack()
    } catch (err) {
      console.error('Queue job failed', err)
      msg.retry()
    }
  }
}

async function processJob(job: QueueJob, env: Env) {
  if (job.type === 'inbound') return handleInbound(job, env)
  if (job.type === 'outbound') return handleOutbound(job, env)
}

async function handleInbound(job: Extract<QueueJob, { type: 'inbound' }>, env: Env) {
  const { organizationId, integrationId, incoming } = job

  // Upsert customer
  const customerId = crypto.randomUUID()
  await env.DB.prepare(`
    INSERT INTO customers (id, organization_id, name, external_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(organization_id, external_id) DO NOTHING
  `).bind(customerId, organizationId, incoming.customerName, incoming.externalCustomerId).run()

  const customer = await env.DB.prepare(
    'SELECT id FROM customers WHERE organization_id = ? AND external_id = ?'
  ).bind(organizationId, incoming.externalCustomerId).first<{ id: string }>()
  if (!customer) throw new Error('Customer upsert failed')

  // Upsert conversation (one per external chat)
  const convId = crypto.randomUUID()
  const externalConvId = `${incoming.channel}:${incoming.externalCustomerId}`
  await env.DB.prepare(`
    INSERT INTO conversations (id, organization_id, customer_id, integration_id, external_id, channel, status, last_message_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', unixepoch())
    ON CONFLICT(organization_id, external_id) DO UPDATE SET last_message_at = unixepoch(), status = 'open'
  `).bind(convId, organizationId, customer.id, integrationId, externalConvId, incoming.channel).run()

  const conv = await env.DB.prepare(
    'SELECT id FROM conversations WHERE organization_id = ? AND external_id = ?'
  ).bind(organizationId, externalConvId).first<{ id: string }>()
  if (!conv) throw new Error('Conversation upsert failed')

  // Insert message
  const msgId = crypto.randomUUID()
  await env.DB.prepare(`
    INSERT INTO messages (id, conversation_id, organization_id, sender_type, content, external_id)
    VALUES (?, ?, ?, 'customer', ?, ?)
    ON CONFLICT DO NOTHING
  `).bind(msgId, conv.id, organizationId, incoming.text, incoming.externalId).run()

  const message = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(msgId).first()

  // Broadcast to agents watching this conversation
  const roomId = env.CONVERSATION_ROOM.idFromName(conv.id)
  const room = env.CONVERSATION_ROOM.get(roomId)
  await room.fetch(new Request('https://do/broadcast', {
    method: 'POST',
    body: JSON.stringify({ type: 'message.created', message }),
  }))
}

async function handleOutbound(job: Extract<QueueJob, { type: 'outbound' }>, env: Env) {
  const message = await env.DB.prepare(
    'SELECT m.*, c.external_id as conv_external_id, i.config as integration_config, i.type as integration_type FROM messages m JOIN conversations c ON m.conversation_id = c.id LEFT JOIN integrations i ON c.integration_id = i.id WHERE m.id = ?'
  ).bind(job.messageId).first<{
    content: string
    conv_external_id: string
    integration_config: string
    integration_type: string
  }>()

  if (!message || message.integration_type !== 'telegram') return

  const config = JSON.parse(message.integration_config) as { bot_token: string }
  const chatId = message.conv_external_id.replace('telegram:', '')
  await sendTelegramMessage(config.bot_token, chatId, message.content)

  await env.DB.prepare(
    'UPDATE messages SET delivered_at = unixepoch() WHERE id = ?'
  ).bind(job.messageId).run()
}
