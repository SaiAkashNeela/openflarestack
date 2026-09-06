import { createRoute } from '@tanstack/react-router'
import TeamPage from '@/routes/team'
import { RequireAuth } from '../lib/route-guards'
import { rootRoute } from './__root'

export const teamRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/team',
  component: () => (
    <RequireAuth>
      <TeamPage />
    </RequireAuth>
  ),
})

export const Route = teamRoute