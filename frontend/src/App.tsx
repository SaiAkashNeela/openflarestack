import { Routes, Route, Navigate } from 'react-router-dom'
import { authClient } from './lib/auth-client'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { InboxPage } from './pages/InboxPage'
import { ConversationPage } from './pages/ConversationPage'
import { IntegrationsPage } from './pages/IntegrationsPage'
import { SettingsPage } from './pages/SettingsPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession()
  if (isPending) return <div className="flex h-screen items-center justify-center text-gray-500 text-sm">Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="/inbox" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="inbox" element={<InboxPage />}>
          <Route path=":conversationId" element={<ConversationPage />} />
        </Route>
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
