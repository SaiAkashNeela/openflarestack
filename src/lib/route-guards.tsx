import { Navigate, useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { authClient } from '@/lib/auth-client'
import { useOrganizationState } from '@/lib/organization'

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted-foreground">
      Loading openflarestack...
    </div>
  )
}

export function RequireAuth({
  children,
  allowUnassigned = false,
}: {
  children: ReactNode
  allowUnassigned?: boolean
}) {
  const { data: session, isPending } = authClient.useSession()
  const { organizations, activeOrganization, loading: orgsPending } = useOrganizationState({
    enabled: !!session,
  })
  const location = useLocation({ select: (value) => value.pathname })
  const activeOrganizationId = session?.session?.activeOrganizationId

  if (isPending) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  if (orgsPending) return <LoadingScreen />
  if (!allowUnassigned && (organizations?.length ?? 0) === 0 && !activeOrganization && !activeOrganizationId) {
    return <Navigate to="/welcome" replace />
  }

  return <>{children}</>
}