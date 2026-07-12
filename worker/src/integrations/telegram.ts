import type { IncomingMessage } from './types'

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from: { id: number; first_name: string; last_name?: string; username?: string }
    chat: { id: number }
    text?: string
    date: number
  }
}

export function parseTelegramUpdate(update: TelegramUpdate): IncomingMessage | null {
  const msg = update.message
  if (!msg?.text) return null
  return {
    externalId: String(msg.message_id),
    externalCustomerId: String(msg.from.id),
    customerName: [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' '),
    text: msg.text,
    channel: 'telegram',
  }
}

export async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Telegram sendMessage failed: ${err}`)
  }
}
