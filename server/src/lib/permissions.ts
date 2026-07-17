import type { Context } from 'hono'
import type { AppEnv } from '../index'

export type OrgRole = 'owner' | 'admin' | 'member'

export function requireOrgRole(c: Context<AppEnv>, allowed: OrgRole[]) {
  const role = c.get('orgRole')
  if (!role || !allowed.includes(role as OrgRole)) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  return null
}
