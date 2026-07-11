import { Hono } from 'hono'
import type { AppEnv } from '../index'
import { nanoid } from '../lib/id'

const route = new Hono<AppEnv>()

route.get('/', async (c) => {
  const orgId = c.var.orgId!
  const status = c.req.query('status') ?? 'open'
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100)
  const { results } = await c.env.DB.prepare(`
    SELECT c.*, cu.name as customer_name, cu.email as customer_email,
           u.name as assigned_to_name
    FROM conversations c
    JOIN customers cu ON c.customer_id = cu.id
    LEFT JOIN user u ON c.assigned_to = u.id
    WHERE c.organization_id = ?
      AND (? = 'all' OR c.status = ?)
    ORDER BY c.last_message_at DESC NULLS LAST
    LIMIT ?
  `).bind(orgId, status, status, limit).all()
  return c.json({ conversations: results })
})

route.post('/', async (c) => {
  const orgId = c.var.orgId!
  const body = await c.req.json<{ customer_id: string; subject?: string; channel?: string }>()
  const id = nanoid()
  await c.env.DB.prepare(`
    INSERT INTO conversations (id, organization_id, customer_id, subject, channel, status)
    VALUES (?, ?, ?, ?, ?, 'open')
  `).bind(id, orgId, body.customer_id, body.subject ?? null, body.channel ?? 'api').run()
  const conv = await c.env.DB.prepare(
    'SELECT * FROM conversations WHERE id = ?'
  ).bind(id).first()
  return c.json({ conversation: conv }, 201)
})

route.get('/:id', async (c) => {
  const orgId = c.var.orgId!
  const conv = await c.env.DB.prepare(
    'SELECT * FROM conversations WHERE id = ? AND organization_id = ?'
  ).bind(c.req.param('id'), orgId).first()
  if (!conv) return c.json({ error: 'Not found' }, 404)
  return c.json({ conversation: conv })
})

route.patch('/:id', async (c) => {
  const orgId = c.var.orgId!
  const body = await c.req.json<{ status?: string; assigned_to?: string | null }>()
  const updates: string[] = []
  const values: (string | number | null)[] = []
  if (body.status) { updates.push('status = ?'); values.push(body.status) }
  if ('assigned_to' in body) { updates.push('assigned_to = ?'); values.push(body.assigned_to ?? null) }
  if (!updates.length) return c.json({ error: 'Nothing to update' }, 400)
  updates.push('updated_at = unixepoch()')
  await c.env.DB.prepare(
    `UPDATE conversations SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`
  ).bind(...values, c.req.param('id'), orgId).run()
  const conv = await c.env.DB.prepare(
    'SELECT * FROM conversations WHERE id = ?'
  ).bind(c.req.param('id')).first()
  return c.json({ conversation: conv })
})

export default route
