import { Hono } from 'hono'
import type { AppEnv } from '../index'
import { nanoid } from '../lib/id'
import { recordDomainEvent } from '../integrations/events'
import { setConversationReadState } from '../lib/conversation-read'
import { createNotifications } from '../lib/notifications'

const route = new Hono<AppEnv>()

route.get('/', async (c) => {
  const orgId = c.var.orgId!
  const userId = c.get('user')?.id
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  const status = c.req.query('status') ?? 'open'
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100)
  const { results } = await c.env.DB.prepare(`
    SELECT c.*, cu.name as customer_name, cu.email as customer_email,
           cu.phone as customer_phone,
           cu.external_id as customer_external_id,
           u.name as assigned_to_name,
           CASE WHEN EXISTS(
             SELECT 1
             FROM messages m
             WHERE m.conversation_id = c.id
               AND m.organization_id = c.organization_id
               AND m.sender_type = 'customer'
               AND m.created_at > COALESCE(cr.last_read_at, 0)
           ) THEN 1 ELSE 0 END AS unread
    FROM conversations c
    JOIN customers cu ON c.customer_id = cu.id
    LEFT JOIN user u ON c.assigned_to = u.id
    LEFT JOIN conversation_reads cr
      ON cr.organization_id = c.organization_id
     AND cr.conversation_id = c.id
     AND cr.user_id = ?
    WHERE c.organization_id = ?
      AND (? = 'all' OR c.status = ?)
    ORDER BY c.last_message_at DESC NULLS LAST
    LIMIT ?
  `).bind(userId, orgId, status, status, limit).all()
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
  if (conv) {
    await recordDomainEvent(c.env, orgId, 'conversation.created', 'conversation', id, {
      customerId: body.customer_id,
      subject: body.subject ?? null,
      channel: body.channel ?? 'api',
    })
  }
  return c.json({ conversation: conv }, 201)
})

route.get('/stats', async (c) => {
  const orgId = c.var.orgId!
  const todayStart = Math.floor(new Date().setHours(0,0,0,0) / 1000)
  const [open, resolved, today] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as n FROM conversations WHERE organization_id = ? AND status = ?').bind(orgId, 'open').first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as n FROM conversations WHERE organization_id = ? AND status = ?').bind(orgId, 'resolved').first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as n FROM conversations WHERE organization_id = ? AND created_at >= ?').bind(orgId, todayStart).first<{ n: number }>(),
  ])
  return c.json({ open: open?.n ?? 0, resolved: resolved?.n ?? 0, today: today?.n ?? 0 })
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
  const userId = c.get('user')?.id
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  const body = await c.req.json<{ status?: string; assigned_to?: string | null; readState?: 'read' | 'unread' }>()
  const existing = await c.env.DB.prepare(
    'SELECT status, assigned_to FROM conversations WHERE id = ? AND organization_id = ?',
  )
    .bind(c.req.param('id'), orgId)
    .first<{ status: string; assigned_to: string | null }>()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const updates: string[] = []
  const values: (string | number | null)[] = []
  if (body.status) { updates.push('status = ?'); values.push(body.status) }
  if ('assigned_to' in body) { updates.push('assigned_to = ?'); values.push(body.assigned_to ?? null) }
  const readState = body.readState
  if (!updates.length && !readState) return c.json({ error: 'Nothing to update' }, 400)

  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()')
    await c.env.DB.prepare(
      `UPDATE conversations SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`
    ).bind(...values, c.req.param('id'), orgId).run()
  }

  if (readState === 'read') {
    await setConversationReadState(c.env, {
      organizationId: orgId,
      conversationId: c.req.param('id'),
      userId,
      read: true,
    })
  } else if (readState === 'unread') {
    await setConversationReadState(c.env, {
      organizationId: orgId,
      conversationId: c.req.param('id'),
      userId,
      read: false,
    })
  }

  const conv = await c.env.DB.prepare(
    'SELECT * FROM conversations WHERE id = ?'
  ).bind(c.req.param('id')).first<{ id: string; subject: string | null }>()
  if (conv) {
    if (body.status && body.status !== existing.status) {
      await recordDomainEvent(c.env, orgId, 'status.changed', 'conversation', conv.id, {
        from: existing.status,
        to: body.status,
      })
      if (body.status === 'closed') {
        await recordDomainEvent(c.env, orgId, 'conversation.closed', 'conversation', conv.id, {
          status: body.status,
        })
      }
    }
    if ('assigned_to' in body && body.assigned_to !== existing.assigned_to) {
      if (body.assigned_to) {
        await createNotifications(c.env, [body.assigned_to], {
          organizationId: orgId,
          actorUserId: userId,
          type: 'assignment',
          title: 'Conversation assigned to you',
          body: conv.subject ?? 'A conversation needs your attention',
          entityType: 'conversation',
          entityId: conv.id,
          data: {
            conversationId: conv.id,
            assignedTo: body.assigned_to,
          },
        })
      }
      await recordDomainEvent(c.env, orgId, body.assigned_to ? 'agent.assigned' : 'agent.unassigned', 'conversation', conv.id, {
        assignedTo: body.assigned_to,
      })
    }
    await recordDomainEvent(c.env, orgId, 'conversation.updated', 'conversation', conv.id, {
      status: body.status ?? existing.status,
      assignedTo: 'assigned_to' in body ? body.assigned_to ?? null : existing.assigned_to,
    })
  }
  return c.json({ conversation: conv })
})

export default route
