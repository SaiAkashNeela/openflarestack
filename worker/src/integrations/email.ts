import PostalMime from 'postal-mime'

import type { IncomingMessage } from './types'

type ParsedEmail = {
  subject?: string | null
  text?: string | null
  html?: string | null
  messageId?: string | null
}

type IncomingEmail = {
  from: string
  to: string
  headers: Headers
  raw: ReadableStream
  rawSize: number
}

export type EmailIntegrationConfig = {
  address?: string
  fromName?: string
}

export function readEmailIntegrationConfig(config: string): EmailIntegrationConfig {
  if (!config) return {}

  try {
    const parsed = JSON.parse(config) as Record<string, unknown>
    return {
      address: typeof parsed.address === 'string' ? parsed.address : undefined,
      fromName: typeof parsed.fromName === 'string' ? parsed.fromName : undefined,
    }
  } catch {
    return {}
  }
}

export function normalizeEmailAddress(value: string) {
  return value.trim().toLowerCase()
}

export function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function formatEmailSubject(subject?: string | null, fallback?: string | null) {
  const base = subject?.trim() || fallback?.trim() || 'New message'
  return /^re:/i.test(base) ? base : `Re: ${base}`
}

export async function parseIncomingEmail(message: IncomingEmail): Promise<IncomingMessage | null> {
  let parsed: ParsedEmail

  try {
    parsed = (await PostalMime.parse(message.raw)) as ParsedEmail
  } catch (err) {
    console.error('Failed to parse inbound email', err)
    return null
  }

  const sender = normalizeEmailAddress(message.from)
  const recipient = normalizeEmailAddress(message.to)
  const subject = parsed.subject?.trim() || message.headers.get('subject')?.trim() || undefined
  const text = parsed.text?.trim() || stripHtml(parsed.html ?? '')
  const messageId = parsed.messageId?.trim() || message.headers.get('message-id')?.trim() || undefined
  const body = text || subject || ''

  if (!body.trim()) return null

  return {
    externalId: messageId ?? `${sender}:${recipient}:${subject ?? 'no-subject'}:${message.rawSize}`,
    externalCustomerId: sender,
    customerName: sender,
    customerEmail: sender,
    subject,
    text: body,
    channel: 'email',
    conversationKey: `email:${recipient}:${sender}`,
    metadata: {
      sender,
      recipient,
      messageId,
      rawSize: message.rawSize,
    },
  }
}
