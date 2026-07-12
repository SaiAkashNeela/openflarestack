import { Hono } from 'hono'
import type { AppEnv } from '../index'
import { nanoid } from '../lib/id'

const route = new Hono<AppEnv>()

route.get('/', async (c) => {
  const orgId = c.get('orgId')
  const q = c.req.query('q')
  let stmt = c.env.DB.prepare(
    q
      ? `SELECT * FROM customers WHERE organization_id = ? AND (name LIKE ? OR email LIKE ?) ORDER BY created_at DESC LIMIT 50`
      : `SELECT * FROM customers WHERE organization_id = ? ORDER BY created_at DESC LIMIT 50`
  )
  const params = q ? [orgId, `%${q}%`, `%${q}%`] : [orgId]
  const { results } = await stmt.bind(...params).all()
  return c.json({ customers: results })
})

route.post('/', async (c) => {
  const orgId = c.get('orgId')
  const body = await c.req.json<{ name: string; email?: string; phone?: string; external_id?: string }>()
  if (!body.name?.trim()) return c.json({ error: 'name required' }, 400)
  const id = nanoid()
  await c.env.DB.prepare(`
    INSERT OR IGNORE INTO customers (id, organization_id, name, email, phone, external_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, orgId, body.name, body.email ?? null, body.phone ?? null, body.external_id ?? null).run()
  const customer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first()
  return c.json({ customer }, 201)
})

route.get('/:id', async (c) => {
  const orgId = c.get('orgId')
  const customer = await c.env.DB.prepare(
    'SELECT * FROM customers WHERE id = ? AND organization_id = ?'
  ).bind(c.req.param('id'), orgId).first()
  if (!customer) return c.json({ error: 'Not found' }, 404)
  const { results: conversations } = await c.env.DB.prepare(
    'SELECT * FROM conversations WHERE customer_id = ? ORDER BY last_message_at DESC LIMIT 20'
  ).bind(c.req.param('id')).all()
  return c.json({ customer, conversations })
})

export default route
