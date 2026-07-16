import { Hono } from 'hono'
import type { AppEnv } from '../index'
import {
  readCloudflareAIGatewayConfig,
  readOpenAICompatibleIntegrationConfig,
} from '../integrations/provider'

const route = new Hono<AppEnv>()

route.get('/integrations', async (c) => {
  const orgId = c.get('orgId')
  const { results } = await c.env.DB.prepare(
    "SELECT id, type, name, config, enabled, created_at FROM integrations WHERE organization_id = ? AND (type = 'openai_compatible' OR type = 'cloudflare_ai_gateway')",
  )
    .bind(orgId)
    .all()
  return c.json({ integrations: results })
})

route.post('/chat/completions', async (c) => {
  const orgId = c.get('orgId')
  const body = await c.req.json<Record<string, unknown>>()
  const integrationId = typeof body.integrationId === 'string' ? body.integrationId : ''
  if (!integrationId) return c.json({ error: 'integrationId required' }, 400)

  const integration = await c.env.DB.prepare(
    'SELECT id, type, config FROM integrations WHERE id = ? AND organization_id = ? AND enabled = 1',
  )
    .bind(integrationId, orgId)
    .first<{ id: string; type: string; config: string }>()
  if (!integration) return c.json({ error: 'Not found' }, 404)

  const baseBody = { ...body }
  delete (baseBody as Record<string, unknown>).integrationId

  if (integration.type === 'openai_compatible') {
    const config = readOpenAICompatibleIntegrationConfig(integration.config)
    if (!config.baseUrl || !config.apiKey) return c.json({ error: 'Provider is not configured' }, 400)
    const model = (typeof baseBody.model === 'string' && baseBody.model) || config.model
    if (!model) return c.json({ error: 'Model required' }, 400)
    const res = await fetch(`${normalizeBaseUrl(config.baseUrl)}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ ...baseBody, model }),
    })
    return proxyResponse(res)
  }

  if (integration.type === 'cloudflare_ai_gateway') {
    const config = readCloudflareAIGatewayConfig(integration.config)
    if (!config.endpoint || !config.authToken) return c.json({ error: 'Provider is not configured' }, 400)
    const model = (typeof baseBody.model === 'string' && baseBody.model) || config.model
    if (!model) return c.json({ error: 'Model required' }, 400)
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    headers.Authorization = `Bearer ${config.authToken}`
    headers['cf-aig-authorization'] = config.authToken
    const res = await fetch(config.endpoint.replace(/\/$/, ''), {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...baseBody, model }),
    })
    return proxyResponse(res)
  }

  return c.json({ error: 'Unsupported provider integration' }, 400)
})

function normalizeBaseUrl(baseUrl: string) {
  const next = baseUrl.replace(/\/$/, '')
  return next.endsWith('/v1') ? next.slice(0, -3) : next
}

async function proxyResponse(res: Response) {
  return new Response(await res.text(), {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  })
}

export default route
