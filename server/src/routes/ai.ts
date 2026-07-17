import { Hono } from 'hono'
import type { AppEnv } from '../index'
import { requestProviderChatCompletion, type ProviderIntegration } from '../integrations/provider'

const route = new Hono<AppEnv>()

route.get('/integrations', async (c) => {
  const orgId = c.get('orgId')
  const { results } = await c.env.DB.prepare(
    "SELECT id, type, name, config, enabled, created_at FROM integrations WHERE organization_id = ? AND type = 'openai_compatible'",
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
    .first<ProviderIntegration>()
  if (!integration) return c.json({ error: 'Not found' }, 404)

  const baseBody = { ...body }
  delete (baseBody as Record<string, unknown>).integrationId

  try {
    const res = await requestProviderChatCompletion(
      integration,
      baseBody,
      {
        timeoutMs: 30_000,
        retries: 1,
      },
    )
    return proxyResponse(res)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Provider request failed' }, 502)
  }
})

function proxyResponse(res: Response) {
  return new Response(res.body, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  })
}

export default route
