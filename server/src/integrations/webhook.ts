import type { IncomingMessage } from './types'

export type GenericWebhookPayload = Record<string, unknown>

export function parseGenericWebhook(body: GenericWebhookPayload): IncomingMessage | null {
  const text = [body.text, body.body, body.subject, body.title]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find(Boolean)
  if (!text) return null

  const externalCustomerId = [
    body.externalCustomerId,
    body.customerId,
    body.customerEmail,
    body.email,
    body.customerPhone,
    body.phone,
    body.externalId,
    body.ticketId,
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find(Boolean)

  if (!externalCustomerId) return null

  const metadata = Object.fromEntries(
    Object.entries(body).filter(([, value]) => typeof value !== 'undefined'),
  ) as Record<string, unknown>

  return {
    externalId:
      (typeof body.externalId === 'string' && body.externalId) ||
      (typeof body.ticketId === 'string' && body.ticketId) ||
      externalCustomerId,
    externalCustomerId,
    customerName:
      (typeof body.customerName === 'string' && body.customerName) ||
      (typeof body.name === 'string' && body.name) ||
      (typeof body.customerEmail === 'string' && body.customerEmail) ||
      (typeof body.email === 'string' && body.email) ||
      'Unknown customer',
    customerEmail: typeof body.customerEmail === 'string' ? body.customerEmail : typeof body.email === 'string' ? body.email : undefined,
    customerPhone: typeof body.customerPhone === 'string' ? body.customerPhone : typeof body.phone === 'string' ? body.phone : undefined,
    subject: typeof body.subject === 'string' ? body.subject : typeof body.title === 'string' ? body.title : undefined,
    text,
    channel: typeof body.channel === 'string' ? body.channel : 'webhook',
    metadata,
  }
}
