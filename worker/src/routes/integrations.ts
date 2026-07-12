import { Hono } from 'hono'
import type { AppEnv } from '../index'
import { nanoid } from '../lib/id'

const route = new Hono<AppEnv>()

route.get('/', async (c) => {
  const orgId = c.get('orgId')
  const { results } = await c.env.DB.prepare(
    'SELECT id, type, name, enabled, created_at FROM integrations WHERE organization_id = ?'
  ).bind(orgId).all()
  return c.json({ integrations: results })
})

route.post('/', async (c) => {
  const orgId = c.get('orgId')
  const body = await c.req.json<{ type: string; name: string; config: Record<string, string> }>()
  if (!body.type || !body.name) return c.json({ error: 'type and name required' }, 400)
  const id = nanoid()
  await c.env.DB.prepare(`
    INSERT INTO integrations (id, organization_id, type, name, config)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, orgId, body.type, body.name, JSON.stringify(body.config ?? {})).run()
  const integration = await c.env.DB.prepare(
    'SELECT id, type, name, enabled, created_at FROM integrations WHERE id = ?'
  ).bind(id).first()
  return c.json({ integration }, 201)
})

route.delete('/:id', async (c) => {
  const orgId = c.get('orgId')
  await c.env.DB.prepare(
    'DELETE FROM integrations WHERE id = ? AND organization_id = ?'
  ).bind(c.req.param('id'), orgId).run()
  return c.json({ ok: true })
})

export default route
