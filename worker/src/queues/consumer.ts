import type { Env } from '../index'
import type { InboundJob, OutboundJob } from '../integrations/types'
import { sendTelegramMessage } from '../integrations/telegram'
import { formatEmailSubject, readEmailIntegrationConfig, stripHtml } from '../integrations/email'
import { nanoid } from '../lib/id'
import { mergeMetadata } from '../lib/customer-metadata'
import {
  readWebhookIntegrationConfig,
  signWebhookDelivery,
  type WebhookDeliveryJob,
  recordDomainEvent,
} from '../integrations/events'
import { sendDiscordMessage } from '../integrations/discord'
import {
  fetchGitHubInstallationToken,
  readGitHubIntegrationConfig,
  sendGitHubIssueComment,
} from '../integrations/github'

type QueueJob = InboundJob | OutboundJob | WebhookDeliveryJob

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
  if (job.type === 'webhook-delivery') return handleWebhookDelivery(job, env)
}

async function handleInbound(job: Extract<QueueJob, { type: 'inbound' }>, env: Env) {
  const { organizationId, integrationId, incoming } = job

  const existingCustomer = await env.DB.prepare(
    'SELECT id, name, email, phone, metadata FROM customers WHERE organization_id = ? AND external_id = ?',
  )
    .bind(organizationId, incoming.externalCustomerId)
    .first<{
      id: string
      name: string
      email: string | null
      phone: string | null
      metadata: string | null
    }>()

  const customerId = existingCustomer?.id ?? nanoid()
  const metadata = mergeMetadata(existingCustomer?.metadata, incoming.metadata)

  if (existingCustomer) {
    await env.DB.prepare(`
      UPDATE customers
      SET name = ?, email = COALESCE(?, email), phone = COALESCE(?, phone), metadata = ?, updated_at = unixepoch()
      WHERE id = ? AND organization_id = ?
    `)
      .bind(
        incoming.customerName,
        incoming.customerEmail ?? null,
        incoming.customerPhone ?? null,
        JSON.stringify(metadata),
        customerId,
        organizationId,
      )
      .run()
    await recordDomainEvent(env, organizationId, 'customer.updated', 'customer', customerId, {
      externalCustomerId: incoming.externalCustomerId,
      channel: incoming.channel,
    })
  } else {
    await env.DB.prepare(`
      INSERT INTO customers (id, organization_id, name, external_id, email, phone, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        customerId,
        organizationId,
        incoming.customerName,
        incoming.externalCustomerId,
        incoming.customerEmail ?? null,
        incoming.customerPhone ?? null,
        JSON.stringify(metadata),
      )
      .run()
    await recordDomainEvent(env, organizationId, 'customer.created', 'customer', customerId, {
      externalCustomerId: incoming.externalCustomerId,
      channel: incoming.channel,
    })
  }

  const customer = await env.DB.prepare(
    'SELECT id FROM customers WHERE organization_id = ? AND external_id = ?',
  )
    .bind(organizationId, incoming.externalCustomerId)
    .first<{ id: string }>()
  if (!customer) throw new Error('Customer upsert failed')

  const directConversationId = incoming.conversationId
  const externalConvId = incoming.conversationKey ?? `${incoming.channel}:${incoming.externalCustomerId}`
  const existingConversation = directConversationId
    ? await env.DB.prepare(
        'SELECT id, subject, external_id FROM conversations WHERE organization_id = ? AND id = ?',
      )
        .bind(organizationId, directConversationId)
        .first<{ id: string; subject: string | null; external_id: string | null }>()
    : await env.DB.prepare(
        'SELECT id, subject, external_id FROM conversations WHERE organization_id = ? AND external_id = ?',
      )
        .bind(organizationId, externalConvId)
        .first<{ id: string; subject: string | null; external_id: string | null }>()

  const convId = existingConversation?.id ?? nanoid()
  if (existingConversation) {
    await env.DB.prepare(`
      UPDATE conversations
      SET customer_id = ?, integration_id = ?, channel = ?, status = 'open', last_message_at = unixepoch(), updated_at = unixepoch()
      WHERE id = ? AND organization_id = ?
    `)
      .bind(customer.id, integrationId, incoming.channel, convId, organizationId)
      .run()
  } else {
    await env.DB.prepare(`
      INSERT INTO conversations (id, organization_id, customer_id, integration_id, external_id, channel, status, last_message_at)
      VALUES (?, ?, ?, ?, ?, ?, 'open', unixepoch())
    `)
      .bind(convId, organizationId, customer.id, integrationId, externalConvId, incoming.channel)
      .run()
  }

  const conv = await env.DB.prepare(
    directConversationId
      ? 'SELECT id FROM conversations WHERE organization_id = ? AND id = ?'
      : 'SELECT id FROM conversations WHERE organization_id = ? AND external_id = ?',
  )
    .bind(organizationId, directConversationId ?? externalConvId)
    .first<{ id: string }>()
  if (!conv) throw new Error('Conversation upsert failed')

  if (!existingConversation) {
    await recordDomainEvent(env, organizationId, 'conversation.created', 'conversation', conv.id, {
      channel: incoming.channel,
      integrationId,
      customerId: customer.id,
      externalId: externalConvId,
    })
  } else if (incoming.subject && incoming.subject !== existingConversation.subject) {
    await recordDomainEvent(env, organizationId, 'conversation.updated', 'conversation', conv.id, {
      channel: incoming.channel,
      subject: incoming.subject,
      externalId: externalConvId,
    })
  }

  if (incoming.subject) {
    await env.DB.prepare(
      'UPDATE conversations SET subject = COALESCE(subject, ?), updated_at = unixepoch() WHERE id = ? AND organization_id = ?',
    )
      .bind(incoming.subject, conv.id, organizationId)
      .run()
  }

  const existingMessage = await env.DB.prepare(
    'SELECT id FROM messages WHERE conversation_id = ? AND external_id = ? AND organization_id = ?',
  )
    .bind(conv.id, incoming.externalId, organizationId)
    .first<{ id: string }>()

  let messageId = existingMessage?.id ?? nanoid()
  if (!existingMessage) {
    await env.DB.prepare(`
      INSERT INTO messages (id, conversation_id, organization_id, sender_type, content, metadata, external_id)
      VALUES (?, ?, ?, 'customer', ?, ?, ?)
    `)
      .bind(
        messageId,
        conv.id,
        organizationId,
        incoming.text,
        JSON.stringify(incoming.metadata ?? {}),
        incoming.externalId,
      )
      .run()
    await recordDomainEvent(env, organizationId, 'message.received', 'message', messageId, {
      conversationId: conv.id,
      externalId: incoming.externalId,
      channel: incoming.channel,
      integrationId,
    })
  }

  const message = await env.DB.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? AND external_id = ? AND organization_id = ?',
  )
    .bind(conv.id, incoming.externalId, organizationId)
    .first()
  if (!message) return

  const roomId = env.CONVERSATION_ROOM.idFromName(conv.id)
  const room = env.CONVERSATION_ROOM.get(roomId)
  await room.fetch(
    new Request('https://do/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type: 'message.created', message }),
    }),
  )
}

async function handleOutbound(job: Extract<QueueJob, { type: 'outbound' }>, env: Env) {
  const message = await env.DB.prepare(
    'SELECT m.*, c.external_id as conv_external_id, c.subject as conversation_subject, cu.email as customer_email, i.config as integration_config, i.type as integration_type, i.name as integration_name FROM messages m JOIN conversations c ON m.conversation_id = c.id JOIN customers cu ON c.customer_id = cu.id LEFT JOIN integrations i ON c.integration_id = i.id WHERE m.id = ? AND m.organization_id = ?',
  )
    .bind(job.messageId, job.organizationId)
    .first<{
      content: string
      content_type: string
      conv_external_id: string
      conversation_subject: string | null
      customer_email: string | null
      integration_config: string | null
      integration_type: string | null
      integration_name: string | null
    }>()

  if (!message || !message.integration_type) return

  if (message.integration_type === 'telegram') {
    const config = JSON.parse(message.integration_config ?? '{}') as { bot_token: string }
    const chatId = message.conv_external_id.replace('telegram:', '')
    await sendTelegramMessage(config.bot_token, chatId, message.content)
  } else if (message.integration_type === 'email') {
    const config = readEmailIntegrationConfig(message.integration_config ?? '{}')
    const to = message.customer_email
    const fromAddress = config.address
    const fromName = config.fromName ?? message.integration_name ?? 'Support'

    if (!to) throw new Error('Email customer is missing an address')
    if (!fromAddress) throw new Error('Email integration is missing a sender address')

    const subject = formatEmailSubject(message.conversation_subject, message.content)
    const text = message.content_type === 'html' ? stripHtml(message.content) : message.content

    await env.EMAIL.send({
      to,
      from: { email: fromAddress, name: fromName },
      replyTo: { email: fromAddress, name: fromName },
      subject,
      text,
      ...(message.content_type === 'html' ? { html: message.content } : {}),
    })
  } else if (message.integration_type === 'discord') {
    const config = JSON.parse(message.integration_config ?? '{}') as { botToken?: string; channelId?: string }
    const channelId = config.channelId ?? message.conv_external_id.replace('discord:', '')
    const botToken = config.botToken
    if (!botToken) throw new Error('Discord integration is missing a bot token')
    await sendDiscordMessage(botToken, channelId, message.content)
  } else if (message.integration_type === 'github') {
    const config = readGitHubIntegrationConfig(message.integration_config ?? '{}')
    const owner = config.owner ?? message.conv_external_id.split(':')[1]?.split('/')[0]
    const repoIssue = config.repository ?? message.conv_external_id.split(':')[1]?.split('/')[1]
    const issueNumber = Number(message.conv_external_id.split('#')[1] ?? 0)
    if (!owner || !repoIssue || !issueNumber) throw new Error('GitHub integration is missing a repository mapping')
    if (!config.installationId) throw new Error('GitHub integration is missing an installation id')
    const token = await fetchGitHubInstallationToken(
      config.appId ?? env.GITHUB_APP_ID,
      config.privateKey ?? env.GITHUB_PRIVATE_KEY,
      config.installationId,
    )
    await sendGitHubIssueComment(token.token, owner, repoIssue, issueNumber, message.content)
  } else {
    return
  }

  await env.DB.prepare(
    'UPDATE messages SET delivered_at = unixepoch() WHERE id = ? AND organization_id = ?',
  )
    .bind(job.messageId, job.organizationId)
    .run()
}

async function handleWebhookDelivery(job: WebhookDeliveryJob, env: Env) {
  const event = await env.DB.prepare(
    'SELECT * FROM events WHERE id = ? AND organization_id = ?',
  )
    .bind(job.eventId, job.organizationId)
    .first<{
      id: string
      organization_id: string
      type: string
      entity_type: string
      entity_id: string
      payload: string
      created_at: number
    }>()
  const delivery = await env.DB.prepare(
    'SELECT * FROM webhook_deliveries WHERE id = ? AND organization_id = ? AND integration_id = ?',
  )
    .bind(job.deliveryId, job.organizationId, job.integrationId)
    .first<{ id: string; attempts: number }>()
  const integration = await env.DB.prepare(
    'SELECT id, config FROM integrations WHERE id = ? AND organization_id = ?',
  )
    .bind(job.integrationId, job.organizationId)
    .first<{ id: string; config: string }>()

  if (!event || !delivery || !integration) return

  const config = readWebhookIntegrationConfig(integration.config)
  if (!config.url) return

  const body = JSON.stringify({
    id: event.id,
    type: event.type,
    entityType: event.entity_type,
    entityId: event.entity_id,
    organizationId: event.organization_id,
    payload: JSON.parse(event.payload || '{}'),
    createdAt: event.created_at,
  })
  const timestamp = String(Date.now())
  const headers = new Headers({
    'content-type': 'application/json',
    'x-flaredesk-event': event.type,
    'x-flaredesk-delivery': delivery.id,
    'x-flaredesk-timestamp': timestamp,
  })

  for (const [key, value] of Object.entries(config.headers ?? {})) {
    headers.set(key, value)
  }

  if (config.secret) {
    headers.set('x-flaredesk-signature', await signWebhookDelivery(config.secret, body, timestamp))
  }

  const res = await fetch(config.url, {
    method: 'POST',
    headers,
    body,
  })

  if (!res.ok) {
    const responseBody = await res.text().catch(() => '')
    await env.DB.prepare(
      `UPDATE webhook_deliveries
       SET status = 'failed', attempts = attempts + 1, response_code = ?, response_body = ?, error = ?, updated_at = unixepoch()
       WHERE id = ? AND organization_id = ?`,
    )
      .bind(res.status, responseBody, `Webhook delivery failed with ${res.status}`, delivery.id, job.organizationId)
      .run()
    throw new Error(`Webhook delivery failed with ${res.status}`)
  }

  await env.DB.prepare(
    `UPDATE webhook_deliveries
     SET status = 'delivered', attempts = attempts + 1, response_code = ?, response_body = ?, delivered_at = unixepoch(), updated_at = unixepoch()
     WHERE id = ? AND organization_id = ?`,
  )
    .bind(res.status, await res.text().catch(() => ''), delivery.id, job.organizationId)
    .run()
}
