import { Hono } from 'hono'
import type { AppEnv } from '../index'

const route = new Hono<AppEnv>()

route.get('/', async (c) => {
  const orgId = c.get('orgId')
  const { results } = await c.env.DB.prepare(`
    SELECT m.id, m.role, m.createdAt,
           u.id as user_id, u.name, u.email, u.image
    FROM member m
    JOIN user u ON m.userId = u.id
    WHERE m.organizationId = ?
    ORDER BY m.createdAt ASC
  `).bind(orgId).all()
  return c.json({ members: results })
})

export default route
