import type { IncomingMessage } from './types'

export type DiscordIntegrationConfig = {
  guildId?: string
  channelId?: string
  botToken?: string
  webhookSecret?: string
  clientId?: string
  clientSecret?: string
  permissions?: number
  applicationId?: string
  publicKey?: string
  auth?: {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number | null
    scope?: string | null
    tokenType?: string | null
  }
}

export function readDiscordIntegrationConfig(config: string): DiscordIntegrationConfig {
  if (!config) return {}
  try {
    const parsed = JSON.parse(config) as Record<string, unknown>
    return {
      guildId: typeof parsed.guildId === 'string' ? parsed.guildId : undefined,
      channelId: typeof parsed.channelId === 'string' ? parsed.channelId : undefined,
      botToken: typeof parsed.botToken === 'string' ? parsed.botToken : undefined,
      webhookSecret: typeof parsed.webhookSecret === 'string' ? parsed.webhookSecret : undefined,
      clientId: typeof parsed.clientId === 'string' ? parsed.clientId : undefined,
      clientSecret: typeof parsed.clientSecret === 'string' ? parsed.clientSecret : undefined,
      permissions:
        typeof parsed.permissions === 'number'
          ? parsed.permissions
          : typeof parsed.permissions === 'string'
            ? Number(parsed.permissions)
            : undefined,
      applicationId: typeof parsed.applicationId === 'string' ? parsed.applicationId : undefined,
      publicKey: typeof parsed.publicKey === 'string' ? parsed.publicKey : undefined,
      auth: parsed.auth && typeof parsed.auth === 'object'
        ? {
            accessToken:
              typeof (parsed.auth as Record<string, unknown>).accessToken === 'string'
                ? (parsed.auth as Record<string, unknown>).accessToken as string
                : undefined,
            refreshToken:
              typeof (parsed.auth as Record<string, unknown>).refreshToken === 'string'
                ? (parsed.auth as Record<string, unknown>).refreshToken as string
                : undefined,
            expiresAt:
              typeof (parsed.auth as Record<string, unknown>).expiresAt === 'number'
                ? (parsed.auth as Record<string, unknown>).expiresAt as number
                : undefined,
            scope:
              typeof (parsed.auth as Record<string, unknown>).scope === 'string'
                ? (parsed.auth as Record<string, unknown>).scope as string
                : undefined,
            tokenType:
              typeof (parsed.auth as Record<string, unknown>).tokenType === 'string'
                ? (parsed.auth as Record<string, unknown>).tokenType as string
                : undefined,
          }
        : undefined,
    }
  } catch {
    return {}
  }
}

export function parseDiscordMessage(payload: Record<string, unknown>): IncomingMessage | null {
  if (payload.t !== 'MESSAGE_CREATE' || !payload.d || typeof payload.d !== 'object') return null
  const data = payload.d as Record<string, unknown>
  const channelId = typeof data.channel_id === 'string' ? data.channel_id : ''
  const author = data.author && typeof data.author === 'object' ? (data.author as Record<string, unknown>) : null
  const content = typeof data.content === 'string' ? data.content : ''
  if (!channelId || !author || !content.trim()) return null
  const username = typeof author.username === 'string' ? author.username : 'Discord user'
  const userId = typeof author.id === 'string' ? author.id : channelId
  return {
    externalId: typeof data.id === 'string' ? data.id : `${channelId}:${userId}:${Date.now()}`,
    externalCustomerId: `discord:${channelId}:${userId}`,
    customerName: username,
    customerEmail: undefined,
    customerPhone: undefined,
    subject: undefined,
    text: content,
    channel: 'discord',
    conversationKey: `discord:${channelId}`,
    metadata: {
      channelId,
      guildId: typeof data.guild_id === 'string' ? data.guild_id : undefined,
      authorId: userId,
      username,
    },
  }
}

export async function sendDiscordMessage(botToken: string, channelId: string, content: string) {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    throw new Error(`Discord sendMessage failed: ${await res.text()}`)
  }
  return res.json() as Promise<{ id: string }>
}

export async function refreshDiscordAuthorization(config: DiscordIntegrationConfig) {
  if (!config.clientId || !config.clientSecret || !config.auth?.refreshToken) {
    throw new Error('Discord refresh credentials are incomplete')
  }

  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: config.auth.refreshToken,
    }),
  })

  if (!res.ok) {
    throw new Error(`Discord token refresh failed: ${await res.text()}`)
  }

  const token = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    token_type?: string
  }

  return {
    ...config,
    auth: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? config.auth.refreshToken,
      expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
      scope: token.scope ?? config.auth.scope ?? null,
      tokenType: token.token_type ?? config.auth.tokenType ?? null,
    },
  }
}
