import { createRoute } from '@tanstack/react-router'
import WelcomePage from '@/routes/welcome'
import { RequireAuth } from '../lib/route-guards'
import { rootRoute } from './__root'

export const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/welcome',
  component: () => (
    <RequireAuth allowUnassigned>
      <WelcomePage />
    </RequireAuth>
  ),
})

export const Route = welcomeRoute