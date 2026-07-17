import { Hono } from 'hono'
import type { AppEnv } from '../index'
import { nanoid } from '../lib/id'
import { recordDomainEvent } from '../integrations/events'
import { setConversationReadState } from '../lib/conversation-read'
import { createNotifications, findMentionedUserIds } from '../lib/notifications'

const route = new Hono<AppEnv>()

route.get('/:conversationId', async (c) => {
  const orgId = c.var.orgId!
  const convId = c.req.param('conversationId')
  const conv = await c.env.DB.prepare(
    'SELECT id FROM conversations WHERE id = ? AND organization_id = ?'
  ).bind(convId, orgId).first()
  if (!conv) return c.json({ error: 'Not found' }, 404)
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).bind(convId).all()
  return c.json({ messages: results })
})

route.post('/:conversationId', async (c) => {
  const orgId = c.var.orgId!
  const user = c.get('user')
  if (!user?.id) return c.json({ error: 'Unauthorized' }, 401)
  const convId = c.req.param('conversationId')
  const conv = await c.env.DB.prepare(
    'SELECT id FROM conversations WHERE id = ? AND organization_id = ?'
  ).bind(convId, orgId).first()
  if (!conv) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<{ content: string; content_type?: string }>()
  if (!body.content?.trim()) return c.json({ error: 'content required' }, 400)
  const id = nanoid()
  const now = Math.floor(Date.now() / 1000)
  const mentionedUserIds = (await findMentionedUserIds(c.env, orgId, body.content)).filter((mentionedId) => mentionedId !== user.id)
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO messages (id, conversation_id, organization_id, sender_type, sender_id, content, content_type, metadata)
      VALUES (?, ?, ?, 'agent', ?, ?, ?, ?)
    `).bind(
      id,
      convId,
      orgId,
      user?.id ?? null,
      body.content,
      body.content_type ?? 'text',
      JSON.stringify({ mentionedUserIds }),
    ),
    c.env.DB.prepare(
      "UPDATE conversations SET last_message_at = ?, status = 'open', updated_at = unixepoch() WHERE id = ?"
    ).bind(now, convId),
  ])

  await setConversationReadState(c.env, {
    organizationId: orgId,
    conversationId: convId,
    userId: user.id,
    read: true,
  })

  const message = await c.env.DB.prepare(
    'SELECT * FROM messages WHERE id = ? AND organization_id = ?'
  ).bind(id, orgId).first()

  // Broadcast to connected agents via the room namespace
  const roomId = c.env.CONVERSATION_ROOM.idFromName(convId)
  const room = c.env.CONVERSATION_ROOM.get(roomId)
  await room.fetch(new Request('https://do/broadcast', {
    method: 'POST',
    body: JSON.stringify({ type: 'message.created', message }),
  }))

  // Enqueue outbound delivery
  await c.env.QUEUE.send({ type: 'outbound', conversationId: convId, messageId: id, organizationId: orgId })
  await recordDomainEvent(c.env, orgId, 'message.sent', 'message', id, {
    conversationId: convId,
    senderId: user?.id ?? null,
  })

  if (mentionedUserIds.length > 0) {
    const conversation = await c.env.DB.prepare(
      'SELECT subject FROM conversations WHERE id = ? AND organization_id = ?',
    )
      .bind(convId, orgId)
      .first<{ subject: string | null }>()

    await createNotifications(c.env, mentionedUserIds, {
      organizationId: orgId,
      actorUserId: user.id,
      type: 'mention',
      title: `${user.name ?? 'A teammate'} mentioned you`,
      body: conversation?.subject ?? body.content.slice(0, 120),
      entityType: 'message',
      entityId: id,
      data: {
        conversationId: convId,
        messageId: id,
        mentionedUserIds,
      },
    })
  }

  return c.json({ message }, 201)
})

export default route
