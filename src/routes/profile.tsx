import { createRoute } from '@tanstack/react-router'
import ProfilePage from '@/routes/profile'
import { RequireAuth } from '../lib/route-guards'
import { rootRoute } from './__root'

export const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: () => (
    <RequireAuth>
      <ProfilePage />
    </RequireAuth>
  ),
})

export const Route = profileRoute