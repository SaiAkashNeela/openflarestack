import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <h1 className="text-2xl font-semibold text-gray-400">{title}</h1>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Placeholder title="Dashboard" />} />
        <Route path="inbox" element={<Placeholder title="Inbox" />} />
        <Route path="integrations" element={<Placeholder title="Integrations" />} />
        <Route path="settings" element={<Placeholder title="Settings" />} />
      </Route>
    </Routes>
  )
}
