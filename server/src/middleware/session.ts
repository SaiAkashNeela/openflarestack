import type { Context, Next } from 'hono'
import type { AppEnv } from '../index'

export async function sessionMiddleware(c: Context<AppEnv>, next: Next) {
  const { createAuth } = await import('../auth')
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  c.set('user', session?.user ?? null)
  c.set('session', session?.session ?? null)
  await next()
}
