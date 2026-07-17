import type { Env } from '../index'
import { nanoid } from '../lib/id'
import { recordDomainEvent } from './events'
import {
  readOpenAICompatibleIntegrationConfig,
  requestProviderChatCompletion,
  type ProviderIntegration,
} from './provider'

type ConversationRow = {
  id: string
  subject: string | null
  channel: string
  customer_name: string
  integration_type: string | null
  integration_id: string | null
}

type MessageRow = {
  sender_type: string
  content: string
  content_type: string
}

type AutoReplyProviderRow = ProviderIntegration & { config: string }

const SUPPORTED_OUTBOUND_CHANNELS = new Set(['email', 'telegram', 'discord', 'github', 'webchat'])

export async function maybeCreateAutoReply(env: Env, organizationId: string, conversationId: string) {
  const conversation = await env.DB.prepare(
    `SELECT c.id, c.subject, c.channel, cu.name as customer_name, i.type as integration_type, i.id as integration_id
     FROM conversations c
     JOIN customers cu ON cu.id = c.customer_id
     LEFT JOIN integrations i ON i.id = c.integration_id
     WHERE c.id = ? AND c.organization_id = ?`,
  )
    .bind(conversationId, organizationId)
    .first<ConversationRow>()

  if (!conversation) return null
  if (!SUPPORTED_OUTBOUND_CHANNELS.has(conversation.channel)) return null
  if (!conversation.integration_id || !conversation.integration_type) return null

  const provider = await env.DB.prepare(
    `SELECT id, type, config
     FROM integrations
     WHERE organization_id = ? AND enabled = 1 AND type = 'openai_compatible'
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(organizationId)
    .first<AutoReplyProviderRow>()

  if (!provider) return null

  const config = readOpenAICompatibleIntegrationConfig(provider.config)

  if (!config.autoReplyEnabled || !config.model) return null

  const latestMessage = await env.DB.prepare(
    'SELECT sender_type FROM messages WHERE conversation_id = ? AND organization_id = ? ORDER BY created_at DESC LIMIT 1',
  )
    .bind(conversationId, organizationId)
    .first<{ sender_type: string }>()
  if (latestMessage?.sender_type !== 'customer') return null

  const { results } = await env.DB.prepare(
    `SELECT sender_type, content, content_type
     FROM (
       SELECT sender_type, content, content_type, created_at
       FROM messages
       WHERE conversation_id = ? AND organization_id = ?
       ORDER BY created_at DESC
       LIMIT 12
     )
     ORDER BY created_at ASC`,
  )
    .bind(conversationId, organizationId)
    .all<MessageRow>()

  const transcript = results.filter((message) => message.content.trim())
  if (!transcript.some((message) => message.sender_type === 'customer')) return null

  const completion = await requestProviderChatCompletion(
    provider,
    {
      model: config.model,
      temperature: 0.2,
      stream: false,
      messages: buildPrompt(conversation, transcript),
    },
    { timeoutMs: 25_000, retries: 1 },
  ).catch((error) => {
    console.warn('Auto-reply generation failed', {
      organizationId,
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  })

  if (!completion || !completion.ok) return null

  const data = (await completion.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null
  const reply = data?.choices?.[0]?.message?.content?.trim() ?? ''
  if (!reply) return null

  await insertAutoReply(env, organizationId, conversationId, reply, provider.id, provider.type)
  return reply
}

function buildPrompt(conversation: ConversationRow, transcript: MessageRow[]) {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content:
        'You are a concise, friendly support assistant. Reply with one helpful customer-facing message only. Do not mention policies or internal implementation. Keep it brief and specific to the conversation.',
    },
  ]

  if (conversation.subject) {
    messages.push({
      role: 'system',
      content: `Conversation subject: ${conversation.subject}`,
    })
  }

  messages.push({
    role: 'system',
    content: `Customer: ${conversation.customer_name}. Channel: ${conversation.channel}.`,
  })

  for (const message of transcript) {
    messages.push({
      role: message.sender_type === 'customer' ? 'user' : 'assistant',
      content: message.content,
    })
  }

  messages.push({
    role: 'system',
    content: 'Draft the next support reply now.',
  })

  return messages
}

async function insertAutoReply(
  env: Env,
  organizationId: string,
  conversationId: string,
  content: string,
  providerId: string,
  providerType: string,
) {
  const messageId = nanoid()
  const now = Math.floor(Date.now() / 1000)

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO messages (id, conversation_id, organization_id, sender_type, sender_id, content, content_type)
       VALUES (?, ?, ?, 'agent', NULL, ?, 'text')`,
    ).bind(messageId, conversationId, organizationId, content),
    env.DB.prepare(
      `UPDATE conversations
       SET status = 'open', last_message_at = ?, updated_at = unixepoch()
       WHERE id = ? AND organization_id = ?`,
    ).bind(now, conversationId, organizationId),
  ])

  const message = await env.DB.prepare(
    'SELECT * FROM messages WHERE id = ? AND organization_id = ?',
  )
    .bind(messageId, organizationId)
    .first()

  if (!message) return

  const roomId = env.CONVERSATION_ROOM.idFromName(conversationId)
  const room = env.CONVERSATION_ROOM.get(roomId)
  await room.fetch(
    new Request('https://do/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type: 'message.created', message }),
    }),
  )

  await env.QUEUE.send({
    type: 'outbound',
    conversationId,
    messageId,
    organizationId,
  })

  await recordDomainEvent(env, organizationId, 'ai.reply.generated', 'message', messageId, {
    conversationId,
    providerId,
    providerType,
  })
}
