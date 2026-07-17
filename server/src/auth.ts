import { betterAuth } from 'better-auth'
import { organization, bearer } from 'better-auth/plugins'
import type { Env } from './index'
import { getTrustedFrontendOrigins } from './lib/frontend-origin'

// ponytail: factory pattern needed because the DB binding comes from request env
export function createAuth(env: Env) {
  const crossSiteCookies = env.ENVIRONMENT === 'production'
  const socialProviders =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined

  return betterAuth({
    database: env.DB.pool,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [
      ...getTrustedFrontendOrigins(env.FRONTEND_URL),
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ],
    advanced: crossSiteCookies
      ? {
          defaultCookieAttributes: {
            sameSite: 'none',
          },
        }
      : undefined,
    emailAndPassword: { enabled: true },
    socialProviders,
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        schema: {
          organization: { modelName: 'organization' },
        },
      }),
      bearer(),
    ],
  })
}
