import type { Env } from '../index'

type SetConversationReadStateInput = {
  organizationId: string
  conversationId: string
  userId: string
  read: boolean
}

export async function setConversationReadState(env: Env, input: SetConversationReadStateInput) {
  if (!input.userId) return

  if (input.read) {
    const now = Math.floor(Date.now() / 1000)
    await env.DB.prepare(
      `INSERT INTO conversation_reads
       (organization_id, conversation_id, user_id, last_read_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(organization_id, conversation_id, user_id)
       DO UPDATE SET last_read_at = excluded.last_read_at, updated_at = excluded.updated_at`,
    )
      .bind(input.organizationId, input.conversationId, input.userId, now, now)
      .run()
    await broadcastReadState(env, input.conversationId, input.userId, 'read')
    return
  }

  await env.DB.prepare(
    'DELETE FROM conversation_reads WHERE organization_id = ? AND conversation_id = ? AND user_id = ?',
  )
    .bind(input.organizationId, input.conversationId, input.userId)
    .run()
  await broadcastReadState(env, input.conversationId, input.userId, 'unread')
}

async function broadcastReadState(
  env: Env,
  conversationId: string,
  userId: string,
  readState: 'read' | 'unread',
) {
  const roomId = env.CONVERSATION_ROOM.idFromName(conversationId)
  const room = env.CONVERSATION_ROOM.get(roomId)
  await room.fetch(
    new Request('https://do/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        type: 'conversation.read_state.changed',
        conversationId,
        userId,
        readState,
      }),
    }),
  )
}
