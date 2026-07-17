import { Hono } from 'hono'
import type { AppEnv } from '../index'
import {
  countUnreadNotifications,
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  upsertNotificationPreferences,
} from '../lib/notifications'

const route = new Hono<AppEnv>()

route.get('/', async (c) => {
  const orgId = c.get('orgId')!
  const user = c.get('user')
  if (!user?.id) return c.json({ error: 'Unauthorized' }, 401)

  const limit = Math.min(Number(c.req.query('limit') ?? 25), 100)
  const unreadOnly = c.req.query('unread') === '1' || c.req.query('unread') === 'true'
  const [notifications, unreadCount, preferences] = await Promise.all([
    listNotifications(c.env, orgId, user.id, limit, unreadOnly),
    countUnreadNotifications(c.env, orgId, user.id),
    getNotificationPreferences(c.env, orgId, user.id),
  ])

  return c.json({ notifications, unreadCount, preferences })
})

route.get('/preferences', async (c) => {
  const orgId = c.get('orgId')!
  const user = c.get('user')
  if (!user?.id) return c.json({ error: 'Unauthorized' }, 401)

  const preferences = await getNotificationPreferences(c.env, orgId, user.id)
  return c.json({ preferences })
})

route.patch('/preferences', async (c) => {
  const orgId = c.get('orgId')!
  const user = c.get('user')
  if (!user?.id) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json<Partial<{
    emailNotifications: boolean
    mentionNotifications: boolean
    digestNotifications: boolean
  }>>()

  const current = await getNotificationPreferences(c.env, orgId, user.id)
  const next = {
    emailNotifications: body.emailNotifications ?? current.emailNotifications,
    mentionNotifications: body.mentionNotifications ?? current.mentionNotifications,
    digestNotifications: body.digestNotifications ?? current.digestNotifications,
  }

  await upsertNotificationPreferences(c.env, orgId, user.id, next)
  return c.json({ preferences: next })
})

route.patch('/:id', async (c) => {
  const orgId = c.get('orgId')!
  const user = c.get('user')
  if (!user?.id) return c.json({ error: 'Unauthorized' }, 401)

  const body = (await c.req.json<{ read?: boolean }>().catch(() => ({}))) as { read?: boolean }
  const notification = await markNotificationRead(
    c.env,
    orgId,
    user.id,
    c.req.param('id'),
    body.read ?? true,
  )
  if (!notification) return c.json({ error: 'Not found' }, 404)
  return c.json({ notification })
})

route.post('/read-all', async (c) => {
  const orgId = c.get('orgId')!
  const user = c.get('user')
  if (!user?.id) return c.json({ error: 'Unauthorized' }, 401)

  await markAllNotificationsRead(c.env, orgId, user.id)
  return c.json({ ok: true })
})

route.get('/ws', async (c) => {
  const orgId = c.get('orgId')!
  const user = c.get('user')
  if (!user?.id) return c.json({ error: 'Unauthorized' }, 401)

  const roomId = c.env.NOTIFICATION_ROOM.idFromName(`${orgId}:${user.id}`)
  const room = c.env.NOTIFICATION_ROOM.get(roomId)
  return room.fetch(c.req.raw)
})

export default route
