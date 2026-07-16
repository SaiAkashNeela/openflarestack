import { betterAuth } from 'better-auth'
import { organization, bearer } from 'better-auth/plugins'
import type { Env } from './index'

// ponytail: factory pattern needed because D1 binding comes from request env
export function createAuth(env: Env) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    emailAndPassword: { enabled: true },
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
      }),
      bearer(),
    ],
  })
}
