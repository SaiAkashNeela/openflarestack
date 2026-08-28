import type { Context, Next } from 'hono'
import type { AppEnv } from '../index'

export async function securityHeadersMiddleware(c: Context<AppEnv>, next: Next) {
  await next()

  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  const path = new URL(c.req.url).pathname
  if (!path.startsWith('/api/public/')) {
    c.header('Cache-Control', 'no-store')
  }
}
