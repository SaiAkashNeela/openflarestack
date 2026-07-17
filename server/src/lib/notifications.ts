import type { Env } from '../index'
import { nanoid } from './id'

export type NotificationPreferences = {
  emailNotifications: boolean
  mentionNotifications: boolean
  digestNotifications: boolean
}

export type NotificationRow = {
  id: string
  organization_id: string
  user_id: string
  actor_user_id: string | null
  type: string
  title: string
  body: string | null
  entity_type: string
  entity_id: string
  data: string | null
  read_at: number | null
  created_at: number
}

export type NotificationInput = {
  organizationId: string
  userId: string
  actorUserId?: string | null
  type: string
  title: string
  body?: string | null
  entityType: string
  entityId: string
  data?: Record<string, unknown>
}

type MemberRow = {
  user_id: string
  name: string | null
  email: string | null
  role?: string | null
}

export async function getNotificationPreferences(
  env: Env,
  organizationId: string,
  userId: string,
): Promise<NotificationPreferences> {
  const row = await env.DB.prepare(
    `SELECT email_notifications, mention_notifications, digest_notifications
     FROM notification_preferences
     WHERE organization_id = ? AND user_id = ?`,
  )
    .bind(organizationId, userId)
    .first<{
      email_notifications: number
      mention_notifications: number
      digest_notifications: number
    }>()

  return {
    emailNotifications: row ? row.email_notifications === 1 : true,
    mentionNotifications: row ? row.mention_notifications === 1 : true,
    digestNotifications: row ? row.digest_notifications === 1 : false,
  }
}

export async function upsertNotificationPreferences(
  env: Env,
  organizationId: string,
  userId: string,
  preferences: NotificationPreferences,
) {
  await env.DB.prepare(
    `INSERT INTO notification_preferences
       (organization_id, user_id, email_notifications, mention_notifications, digest_notifications, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())
     ON CONFLICT(organization_id, user_id) DO UPDATE SET
       email_notifications = excluded.email_notifications,
       mention_notifications = excluded.mention_notifications,
       digest_notifications = excluded.digest_notifications,
       updated_at = unixepoch()`,
  )
    .bind(
      organizationId,
      userId,
      boolToInt(preferences.emailNotifications),
      boolToInt(preferences.mentionNotifications),
      boolToInt(preferences.digestNotifications),
    )
    .run()
}

export async function listNotifications(
  env: Env,
  organizationId: string,
  userId: string,
  limit = 50,
  unreadOnly = false,
) {
  const query = unreadOnly
    ? `SELECT * FROM notifications
       WHERE organization_id = ? AND user_id = ? AND read_at IS NULL
       ORDER BY created_at DESC
       LIMIT ?`
    : `SELECT * FROM notifications
       WHERE organization_id = ? AND user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
  const { results } = await env.DB.prepare(query).bind(organizationId, userId, limit).all<NotificationRow>()
  return results
}

export async function countUnreadNotifications(env: Env, organizationId: string, userId: string) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM notifications
     WHERE organization_id = ? AND user_id = ? AND read_at IS NULL`,
  )
    .bind(organizationId, userId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

export async function markNotificationRead(
  env: Env,
  organizationId: string,
  userId: string,
  notificationId: string,
  read = true,
) {
  const now = Math.floor(Date.now() / 1000)
  await env.DB.prepare(
    `UPDATE notifications
     SET read_at = CASE WHEN ? THEN COALESCE(read_at, ?) ELSE NULL END
     WHERE id = ? AND organization_id = ? AND user_id = ?`,
  )
    .bind(read ? 1 : 0, now, notificationId, organizationId, userId)
    .run()
  const notification = await getNotificationById(env, organizationId, userId, notificationId)
  if (notification) {
    await broadcastNotification(env, organizationId, userId, {
      type: 'notification.updated',
      notification,
    })
  }
  return notification
}

export async function markAllNotificationsRead(env: Env, organizationId: string, userId: string) {
  const now = Math.floor(Date.now() / 1000)
  await env.DB.prepare(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, ?)
     WHERE organization_id = ? AND user_id = ? AND read_at IS NULL`,
  )
    .bind(now, organizationId, userId)
    .run()
}

export async function createNotification(env: Env, input: NotificationInput) {
  const id = nanoid()
  const createdAt = Math.floor(Date.now() / 1000)
  const insert = await env.DB.prepare(
    `INSERT INTO notifications
       (id, organization_id, user_id, actor_user_id, type, title, body, entity_type, entity_id, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
  )
    .bind(
      id,
      input.organizationId,
      input.userId,
      input.actorUserId ?? null,
      input.type,
      input.title,
      input.body ?? null,
      input.entityType,
      input.entityId,
      JSON.stringify(input.data ?? {}),
      createdAt,
    )
    .run()

  const notification = await getNotificationByEntity(
    env,
    input.organizationId,
    input.userId,
    input.type,
    input.entityType,
    input.entityId,
  )
  if (!notification) return null

  if ((insert.meta?.changes ?? 0) > 0) {
    await broadcastNotification(env, input.organizationId, input.userId, {
      type: 'notification.created',
      notification,
    })
  }

  return notification
}

export async function createNotifications(
  env: Env,
  recipients: string[],
  input: Omit<NotificationInput, 'userId'>,
) {
  const uniqueRecipients = [...new Set(recipients.filter(Boolean))]
  const created = await Promise.all(
    uniqueRecipients.map((userId) =>
      createNotification(env, {
        ...input,
        userId,
      }),
    ),
  )
  return created.filter(Boolean)
}

export async function broadcastNotification(
  env: Env,
  organizationId: string,
  userId: string,
  payload: Record<string, unknown>,
) {
  const roomId = env.NOTIFICATION_ROOM.idFromName(notificationRoomName(organizationId, userId))
  const room = env.NOTIFICATION_ROOM.get(roomId)
  await room.fetch(
    new Request('https://do/broadcast', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  )
}

export async function getConversationNotificationRecipients(
  env: Env,
  organizationId: string,
  conversationId: string,
  excludeUserId?: string | null,
) {
  const conversation = await env.DB.prepare(
    `SELECT assigned_to
     FROM conversations
     WHERE id = ? AND organization_id = ?`,
  )
    .bind(conversationId, organizationId)
    .first<{ assigned_to: string | null }>()
  if (!conversation) return []

  if (conversation.assigned_to) {
    return conversation.assigned_to !== excludeUserId ? [conversation.assigned_to] : []
  }

  const { results: admins } = await env.DB.prepare(
    `SELECT u.id as user_id, u.name, u.email, m.role
     FROM member m
     JOIN user u ON u.id = m.userId
     WHERE m.organizationId = ? AND m.role IN ('owner', 'admin')`,
  )
    .bind(organizationId)
    .all<MemberRow>()

  const fallback = admins.length
    ? admins
    : await env.DB.prepare(
        `SELECT u.id as user_id, u.name, u.email, m.role
         FROM member m
         JOIN user u ON u.id = m.userId
         WHERE m.organizationId = ?`,
      )
        .bind(organizationId)
        .all<MemberRow>()
        .then(({ results }) => results)

  return fallback.filter((member) => member.user_id !== excludeUserId).map((member) => member.user_id)
}

export async function findMentionedUserIds(
  env: Env,
  organizationId: string,
  content: string,
) {
  const tokens = Array.from(content.matchAll(/@([A-Za-z0-9._-]+)/g))
    .map((match) => match[1])
    .filter((token): token is string => typeof token === 'string' && token.length > 0)
  if (!tokens.length) return []

  const { results } = await env.DB.prepare(
    `SELECT u.id as user_id, u.name, u.email
     FROM member m
     JOIN user u ON u.id = m.userId
     WHERE m.organizationId = ?`,
  )
    .bind(organizationId)
    .all<MemberRow>()

  const byHandle = new Map<string, string>()
  for (const member of results) {
    for (const key of mentionKeys(member.name, member.email)) {
      if (!key) continue
      if (!byHandle.has(key)) byHandle.set(key, member.user_id)
    }
  }

  const mentioned = new Set<string>()
  for (const token of tokens) {
    const normalized = normalizeHandle(token)
    const userId = byHandle.get(normalized)
    if (userId) mentioned.add(userId)
  }

  return [...mentioned]
}

function notificationRoomName(organizationId: string, userId: string) {
  return `${organizationId}:${userId}`
}

async function getNotificationById(
  env: Env,
  organizationId: string,
  userId: string,
  notificationId: string,
) {
  return env.DB.prepare(
    `SELECT * FROM notifications
     WHERE id = ? AND organization_id = ? AND user_id = ?`,
  )
    .bind(notificationId, organizationId, userId)
    .first<NotificationRow>()
}

async function getNotificationByEntity(
  env: Env,
  organizationId: string,
  userId: string,
  type: string,
  entityType: string,
  entityId: string,
) {
  return env.DB.prepare(
    `SELECT * FROM notifications
     WHERE organization_id = ? AND user_id = ? AND type = ? AND entity_type = ? AND entity_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(organizationId, userId, type, entityType, entityId)
    .first<NotificationRow>()
}

function boolToInt(value: boolean) {
  return value ? 1 : 0
}

function normalizeHandle(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
}

function mentionKeys(name: string | null, email: string | null) {
  const keys = new Set<string>()
  if (name) {
    keys.add(normalizeHandle(name))
    keys.add(normalizeHandle(name.replace(/\s+/g, '')))
    keys.add(normalizeHandle(name.split(/\s+/)[0] ?? ''))
  }
  if (email) {
    keys.add(normalizeHandle(email.split('@')[0] ?? ''))
  }
  return [...keys].filter(Boolean)
}
