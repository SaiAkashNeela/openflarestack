import React from 'react'
import ReactDOM from 'react-dom/client'

function App() {
  return (
    <div className="flex min-h-screen items-center justify-center font-sans">
      <h1 className="text-2xl font-semibold text-brand-600">FlareDesk</h1>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
