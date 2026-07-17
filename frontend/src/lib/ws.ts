import { useCallback, useEffect, useRef, useState } from "react";

export interface WsMessage {
  type: string;
  [key: string]: unknown;
}

export function useWs(conversationId: string | null) {
  const socket = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);

  const connect = useCallback(() => {
    if (!conversationId) return;

    const apiUrl = import.meta.env.VITE_API_URL ?? window.location.origin;
    const parsed = new URL(apiUrl);
    const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${parsed.host}/api/v1/ws/${conversationId}`);

    socket.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      if (!unmounted.current) {
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as WsMessage;
        setLastMessage(message);
      } catch {
        /* ignore malformed payloads */
      }
    };
  }, [conversationId]);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      socket.current?.close();
      socket.current = null;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  const send = useCallback((message: WsMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(message));
    }
  }, []);

  const typing = useCallback(() => {
    send({ type: "typing" });
  }, [send]);

  return { connected, lastMessage, send, typing };
}
