import { createRouter } from '@tanstack/react-router'
import { rootRoute } from './routes/__root'
import { dashboardRoute } from './routes/dashboard'
import { indexRoute } from './routes/index'
import { integrationsRoute } from './routes/integrations'
import { loginRoute } from './routes/login'
import { notificationsRoute } from './routes/notifications'
import { profileRoute } from './routes/profile'
import { settingsRoute } from './routes/settings'
import { signupRoute } from './routes/signup'
import { teamRoute } from './routes/team'
import { welcomeRoute } from './routes/welcome'

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  integrationsRoute,
  notificationsRoute,
  profileRoute,
  settingsRoute,
  teamRoute,
  welcomeRoute,
  loginRoute,
  signupRoute,
])

export const router = createRouter({
  routeTree,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}