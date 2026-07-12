import { useEffect, useRef, useState, useCallback } from 'react'

export interface WsMessage {
  type: string
  [key: string]: unknown
}

export function useWs(conversationId: string | null) {
  const ws = useRef<WebSocket | null>(null)
  const unmounted = useRef(false)
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<WsMessage[]>([])
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (!conversationId) return
    const base = import.meta.env.VITE_API_URL?.replace('http', 'ws') ?? `ws://${location.host}`
    const socket = new WebSocket(`${base}/api/v1/ws/${conversationId}`)
    ws.current = socket

    socket.onopen = () => setConnected(true)
    socket.onclose = () => {
      setConnected(false)
      if (!unmounted.current) {
        reconnectTimer.current = setTimeout(connect, 3000)
      }
    }
    socket.onerror = () => socket.close()
    socket.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as WsMessage
        setLastMessage(msg)
        setMessages((prev) => [...prev, msg])
      } catch { /* ignore malformed */ }
    }
  }, [conversationId])

  useEffect(() => {
    unmounted.current = false
    connect()
    return () => {
      unmounted.current = true
      ws.current?.close()
      ws.current = null
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [connect])

  const send = useCallback((msg: WsMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg))
    }
  }, [])

  return { connected, messages, lastMessage, send }
}
