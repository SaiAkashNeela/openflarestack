import type { Context, Next } from 'hono'
import type { AppEnv } from '../index'

export async function tenantMiddleware(c: Context<AppEnv>, next: Next) {
  const session = c.get('session')
  const user = c.get('user')
  let orgId = session?.activeOrganizationId

  if (!orgId && user?.id) {
    const member = await c.env.DB.prepare(
      'SELECT organizationId FROM member WHERE userId = ? ORDER BY createdAt ASC LIMIT 1',
    )
      .bind(user.id)
      .first<{ organizationId: string }>()
    orgId = member?.organizationId
  }

  if (!orgId) {
    return c.json({ error: 'No active organization' }, 403)
  }

  const member = await c.env.DB.prepare(
    'SELECT role FROM member WHERE organizationId = ? AND userId = ? LIMIT 1',
  )
    .bind(orgId, user?.id ?? '')
    .first<{ role: string }>()

  if (!member?.role) {
    return c.json({ error: 'No active organization' }, 403)
  }

  c.set('orgId', orgId)
  c.set('orgRole', member.role)
  await next()
}
