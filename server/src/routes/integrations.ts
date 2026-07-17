import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppEnv } from '../index'
import { nanoid } from '../lib/id'
import { createConnectState, verifyConnectState } from '../integrations/connect'
import { recordDomainEvent } from '../integrations/events'
import { readDiscordIntegrationConfig, refreshDiscordAuthorization } from '../integrations/discord'
import { startDiscordGateway, stopDiscordGateway } from '../integrations/discord-gateway'
import { readGitHubIntegrationConfig } from '../integrations/github'
import { requireOrgRole } from '../lib/permissions'

const route = new Hono<AppEnv>()

route.get('/', async (c) => {
  const orgId = c.get('orgId')
  const { results } = await c.env.DB.prepare(
    'SELECT id, type, name, config, enabled, created_at FROM integrations WHERE organization_id = ?'
  ).bind(orgId).all()
  return c.json({ integrations: results })
})

route.post('/', async (c) => {
  const orgId = c.get('orgId')
  const forbidden = requireOrgRole(c, ['owner', 'admin'])
  if (forbidden) return forbidden
  const body = await c.req.json<{ type: string; name: string; config: Record<string, string> }>()
  if (!body.type || !body.name) return c.json({ error: 'type and name required' }, 400)
  const id = nanoid()
  const config = normalizeConfig(body.type, body.config ?? {})
  await c.env.DB.prepare(`
    INSERT INTO integrations (id, organization_id, type, name, config)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, orgId, body.type, body.name, JSON.stringify(config)).run()
  const integration = await c.env.DB.prepare(
    'SELECT id, type, name, config, enabled, created_at FROM integrations WHERE id = ?'
  ).bind(id).first()
  return c.json({
    integration,
    connectUrl: body.type === 'github' || body.type === 'discord'
      ? `/api/v1/integrations/${id}/connect`
      : null,
  }, 201)
})

route.delete('/:id', async (c) => {
  const orgId = c.get('orgId')!
  const forbidden = requireOrgRole(c, ['owner', 'admin'])
  if (forbidden) return forbidden
  const integration = await loadIntegration(c, c.req.param('id'), orgId)
  if (integration?.type === 'discord') {
    await stopDiscordGateway(integration.id)
  }
  await recordDomainEvent(c.env, orgId, 'integration.disconnected', 'integration', c.req.param('id'), {
    type: integration?.type ?? 'unknown',
  })
  await c.env.DB.prepare(
    'DELETE FROM integrations WHERE id = ? AND organization_id = ?'
  ).bind(c.req.param('id'), orgId).run()
  return c.json({ ok: true })
})

route.get('/:id', async (c) => {
  const orgId = c.get('orgId')
  const integration = await c.env.DB.prepare(
    'SELECT id, type, name, config, enabled, created_at FROM integrations WHERE id = ? AND organization_id = ?',
  )
    .bind(c.req.param('id'), orgId)
    .first()
  if (!integration) return c.json({ error: 'Not found' }, 404)
  return c.json({ integration })
})

route.get('/:id/connect', async (c) => {
  const orgId = c.get('orgId')!
  const forbidden = requireOrgRole(c, ['owner', 'admin'])
  if (forbidden) return forbidden
  const integration = await loadIntegration(c, c.req.param('id'), orgId)
  if (!integration) return c.json({ error: 'Not found' }, 404)

  const state = await createConnectState(c.env, {
    orgId,
    integrationId: integration.id,
    type: integration.type,
    nonce: crypto.randomUUID(),
  })

  if (integration.type === 'github') {
    const config = readGitHubIntegrationConfig(integration.config)
    if (!config.appSlug) return c.json({ error: 'GitHub app slug required' }, 400)
    setConnectCookie(c, state)
    return c.redirect(`https://github.com/apps/${encodeURIComponent(config.appSlug)}/installations/new`, 302)
  }

  if (integration.type === 'discord') {
    const config = readDiscordIntegrationConfig(integration.config)
    if (!config.clientId) return c.json({ error: 'Discord client id required' }, 400)
    const callbackUrl = new URL('/api/v1/integrations/discord/callback', c.req.url).toString()
    const url = new URL('https://discord.com/oauth2/authorize')
    url.searchParams.set('client_id', config.clientId)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', 'bot applications.commands identify')
    url.searchParams.set('redirect_uri', callbackUrl)
    url.searchParams.set('state', state)
    url.searchParams.set('disable_guild_select', 'true')
    if (config.permissions) url.searchParams.set('permissions', String(config.permissions))
    setConnectCookie(c, state)
    return c.redirect(url.toString(), 302)
  }

  return c.json({ error: 'Unsupported integration type' }, 400)
})

route.get('/github/callback', async (c) => {
  const state = await readConnectState(c)
  if (!state || state.type !== 'github') return c.json({ error: 'Invalid state' }, 400)
  const orgId = c.get('orgId')!
  const forbidden = requireOrgRole(c, ['owner', 'admin'])
  if (forbidden) return forbidden
  const integration = await loadIntegration(c, state.integrationId, orgId)
  if (!integration) return c.json({ error: 'Not found' }, 404)
  const installationId = c.req.query('installation_id') ?? c.req.query('installationId')
  if (!installationId) return c.json({ error: 'installation_id required' }, 400)

  const config = {
    ...readGitHubIntegrationConfig(integration.config),
    installationId: Number(installationId),
    connectedAt: new Date().toISOString(),
  }

  await updateIntegrationConfig(c, integration.id, orgId, config)
  await recordDomainEvent(c.env, orgId, 'integration.connected', 'integration', integration.id, {
    type: 'github',
  })
  return c.redirect(new URL('/integrations?connected=github', c.env.FRONTEND_URL).toString(), 302)
})

route.get('/discord/callback', async (c) => {
  const state = await readConnectState(c)
  if (!state || state.type !== 'discord') return c.json({ error: 'Invalid state' }, 400)
  const orgId = c.get('orgId')!
  const forbidden = requireOrgRole(c, ['owner', 'admin'])
  if (forbidden) return forbidden
  const integration = await loadIntegration(c, state.integrationId, orgId)
  if (!integration) return c.json({ error: 'Not found' }, 404)
  const code = c.req.query('code')
  if (!code) return c.json({ error: 'code required' }, 400)

  const config = readDiscordIntegrationConfig(integration.config)
  if (!config.clientId || !config.clientSecret) return c.json({ error: 'Discord client credentials required' }, 400)

  const callbackUrl = new URL('/api/v1/integrations/discord/callback', c.req.url).toString()
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl,
    }),
  })
  if (!tokenRes.ok) return c.json({ error: await tokenRes.text() }, 400)
  const token = await tokenRes.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    token_type?: string
  }

  const nextConfig = {
    ...config,
    auth: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
      scope: token.scope ?? null,
      tokenType: token.token_type ?? null,
    },
    connectedAt: new Date().toISOString(),
  }

  await updateIntegrationConfig(c, integration.id, orgId, nextConfig)
  await startDiscordGateway(c.env, integration.id, orgId, nextConfig)
  await recordDomainEvent(c.env, orgId, 'integration.connected', 'integration', integration.id, {
    type: 'discord',
  })
  return c.redirect(new URL('/integrations?connected=discord', c.env.FRONTEND_URL).toString(), 302)
})

route.post('/:id/refresh', async (c) => {
  const orgId = c.get('orgId')!
  const forbidden = requireOrgRole(c, ['owner', 'admin'])
  if (forbidden) return forbidden
  const integration = await loadIntegration(c, c.req.param('id'), orgId)
  if (!integration) return c.json({ error: 'Not found' }, 404)
  if (integration.type !== 'discord') return c.json({ error: 'Unsupported integration type' }, 400)

  const config = await refreshDiscordAuthorization(readDiscordIntegrationConfig(integration.config))
  await updateIntegrationConfig(c, integration.id, orgId, config)
  await recordDomainEvent(c.env, orgId, 'integration.reconnected', 'integration', integration.id, {
    type: 'discord',
  })
  return c.json({ ok: true })
})

function normalizeConfig(type: string, config: Record<string, string>) {
  const next = { ...config }
  if (type === 'webhook' && !next.secret && next.webhookSecret) {
    next.secret = next.webhookSecret
  }
  if (type === 'webhook' && !next.secret) {
    next.secret = crypto.randomUUID().replace(/-/g, '')
  }
  if ((type === 'webchat' || type === 'github' || type === 'discord') && !next.webhookSecret) {
    next.webhookSecret = crypto.randomUUID().replace(/-/g, '')
  }
  if (type === 'webchat' && !next.widgetKey) {
    next.widgetKey = crypto.randomUUID().replace(/-/g, '')
  }
  return next
}

function setConnectCookie(c: Context<AppEnv>, state: string) {
  c.header(
    'Set-Cookie',
    `ofs_connect_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
  )
}

async function readConnectState(c: Context<AppEnv>) {
  const cookie = c.req.header('cookie') ?? ''
  const token = cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('ofs_connect_state='))
    ?.slice('ofs_connect_state='.length)
  if (!token) return null
  return verifyConnectState(c.env, token)
}

async function loadIntegration(c: Context<AppEnv>, id: string, orgId: string) {
  return c.env.DB.prepare(
    'SELECT id, type, name, config, enabled, created_at FROM integrations WHERE id = ? AND organization_id = ?',
  )
    .bind(id, orgId)
    .first<{ id: string; type: string; name: string; config: string; enabled: number; created_at: number | null }>()
}

async function updateIntegrationConfig(c: Context<AppEnv>, id: string, orgId: string, config: Record<string, unknown>) {
  await c.env.DB.prepare(
    'UPDATE integrations SET config = ?, updated_at = unixepoch(), enabled = 1 WHERE id = ? AND organization_id = ?',
  )
    .bind(JSON.stringify(config), id, orgId)
    .run()
}

export default route
