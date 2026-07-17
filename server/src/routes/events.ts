import { Hono } from 'hono'
import type { AppEnv } from '../index'
import { queueWebhookDeliveries } from '../integrations/events'
import { requireOrgRole } from '../lib/permissions'

const route = new Hono<AppEnv>()

route.get('/', async (c) => {
  const orgId = c.get('orgId')!
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100)
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM events WHERE organization_id = ? ORDER BY created_at DESC LIMIT ?',
  )
    .bind(orgId, limit)
    .all()
  return c.json({ events: results })
})

route.get('/:id', async (c) => {
  const orgId = c.get('orgId')!
  const event = await c.env.DB.prepare(
    'SELECT * FROM events WHERE id = ? AND organization_id = ?',
  )
    .bind(c.req.param('id'), orgId)
    .first<{ id: string }>()
  if (!event) return c.json({ error: 'Not found' }, 404)
  const { results: deliveries } = await c.env.DB.prepare(
    'SELECT * FROM webhook_deliveries WHERE event_id = ? AND organization_id = ? ORDER BY created_at ASC',
  )
    .bind(event.id, orgId)
    .all()
  return c.json({ event, deliveries })
})

route.post('/:id/replay', async (c) => {
  const orgId = c.get('orgId')!
  const forbidden = requireOrgRole(c, ['owner', 'admin'])
  if (forbidden) return forbidden
  const event = await c.env.DB.prepare(
    'SELECT id, type FROM events WHERE id = ? AND organization_id = ?',
  )
    .bind(c.req.param('id'), orgId)
    .first<{ id: string; type: string }>()
  if (!event) return c.json({ error: 'Not found' }, 404)
  await queueWebhookDeliveries(c.env, orgId, event.id, event.type)
  return c.json({ ok: true })
})

export default route
