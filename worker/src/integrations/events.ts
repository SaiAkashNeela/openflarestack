import { nanoid } from '../lib/id'
import { signHmacSha256 } from '../lib/crypto'
import type { Env } from '../index'

export type DomainEventType =
  | 'conversation.created'
  | 'conversation.updated'
  | 'conversation.closed'
  | 'message.received'
  | 'message.sent'
  | 'customer.created'
  | 'customer.updated'
  | 'agent.assigned'
  | 'agent.unassigned'
  | 'conversation.transferred'
  | 'ai.handoff'
  | 'tags.updated'
  | 'status.changed'
  | 'integration.connected'
  | 'integration.reconnected'
  | 'integration.disconnected'
  | 'custom'

export type DomainEventPayload = Record<string, unknown>

export type WebhookIntegrationConfig = {
  url?: string
  secret?: string
  events?: string[] | string
  headers?: Record<string, string>
}

export type WebhookDeliveryJob = {
  type: 'webhook-delivery'
  organizationId: string
  eventId: string
  deliveryId: string
  integrationId: string
}

export function readWebhookIntegrationConfig(config: string): WebhookIntegrationConfig {
  if (!config) return {}
  try {
    const parsed = JSON.parse(config) as Record<string, unknown>
    const secret =
      typeof parsed.secret === 'string'
        ? parsed.secret
        : typeof parsed.webhookSecret === 'string'
          ? parsed.webhookSecret
          : undefined
    return {
      url: typeof parsed.url === 'string' ? parsed.url : undefined,
      secret,
      events: Array.isArray(parsed.events)
        ? parsed.events.filter((value): value is string => typeof value === 'string')
        : typeof parsed.events === 'string'
          ? parsed.events
          : undefined,
      headers:
        parsed.headers && typeof parsed.headers === 'object'
          ? (Object.fromEntries(
              Object.entries(parsed.headers as Record<string, unknown>).filter(
                ([, value]) => typeof value === 'string',
              ),
            ) as Record<string, string>)
          : undefined,
    }
  } catch {
    return {}
  }
}

export function shouldDeliverWebhookEvent(config: WebhookIntegrationConfig, eventType: string) {
  const events = config.events
  if (!events) return true
  if (Array.isArray(events)) return events.includes(eventType) || events.includes('*')
  return events
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(eventType)
}

export async function recordDomainEvent(
  env: Env,
  organizationId: string,
  type: DomainEventType,
  entityType: string,
  entityId: string,
  payload: DomainEventPayload = {},
) {
  const eventId = nanoid()
  const now = Math.floor(Date.now() / 1000)
  await env.DB.prepare(
    `INSERT INTO events (id, organization_id, type, entity_type, entity_id, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(eventId, organizationId, type, entityType, entityId, JSON.stringify(payload), now)
    .run()

  await queueWebhookDeliveries(env, organizationId, eventId, type, now)

  return eventId
}

export async function signWebhookDelivery(secret: string, body: string, timestamp: string) {
  return signHmacSha256(secret, `${timestamp}.${body}`)
}

export async function queueWebhookDeliveries(
  env: Env,
  organizationId: string,
  eventId: string,
  eventType: string,
  now = Math.floor(Date.now() / 1000),
) {
  const { results } = await env.DB.prepare(
    `SELECT id, config
     FROM integrations
     WHERE organization_id = ? AND enabled = 1 AND type = ?`,
  )
    .bind(organizationId, 'webhook')
    .all<{ id: string; config: string }>()

  for (const integration of results) {
    const config = readWebhookIntegrationConfig(integration.config)
    if (!config.url || !shouldDeliverWebhookEvent(config, eventType)) continue

    const deliveryId = nanoid()
    await env.DB.prepare(
      `INSERT INTO webhook_deliveries
       (id, organization_id, integration_id, event_id, status, attempts, next_retry_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', 0, NULL, ?, ?)`,
    )
      .bind(deliveryId, organizationId, integration.id, eventId, now, now)
      .run()

    await env.QUEUE.send({
      type: 'webhook-delivery',
      organizationId,
      eventId,
      deliveryId,
      integrationId: integration.id,
    } satisfies WebhookDeliveryJob)
  }
}
