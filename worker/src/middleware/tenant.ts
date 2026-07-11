import type { Context, Next } from 'hono'
import type { AppEnv } from '../index'

export async function tenantMiddleware(c: Context<AppEnv>, next: Next) {
  const session = c.get('session')
  const orgId = session?.activeOrganizationId
  if (!orgId) {
    return c.json({ error: 'No active organization' }, 403)
  }
  c.set('orgId', orgId)
  await next()
}
