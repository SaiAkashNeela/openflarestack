import { betterAuth } from 'better-auth'
import { organization, bearer } from 'better-auth/plugins'
import type { Env } from './index'

// ponytail: factory pattern needed because D1 binding comes from request env
export function createAuth(env: Env) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.FRONTEND_URL],
    emailAndPassword: { enabled: true },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        memberRoles: ['owner', 'admin', 'agent', 'viewer'],
      }),
      bearer(),
    ],
  })
}
