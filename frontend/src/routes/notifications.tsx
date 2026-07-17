import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string;
  entity_id: string;
  read_at: number | null;
  created_at: number;
  data: string | null;
};

export default function NotificationsPage() {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { notifications, unreadCount } = await api.get<{
          notifications: NotificationItem[];
          unreadCount: number;
        }>("/api/v1/notifications?limit=100");
        if (cancelled) return;
        setNotifications(notifications);
        setUnreadCount(unreadCount);
      } catch {
        if (!cancelled) {
          toast({ title: "Notifications are unavailable right now.", tone: "error" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    const base = import.meta.env.VITE_API_URL ?? window.location.origin;
    const wsUrl = new URL("/api/v1/notifications/ws", base);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(wsUrl.toString());
    socket.addEventListener("message", () => {
      void load();
    });

    return () => {
      cancelled = true;
      socket.close();
    };
  }, [toast]);

  const markRead = async (notification: NotificationItem) => {
    if (notification.read_at) return;
    try {
      const { notification: next } = await api.patch<{ notification: NotificationItem }>(
        `/api/v1/notifications/${notification.id}`,
        { read: true },
      );
      setNotifications((prev) => prev.map((item) => (item.id === next.id ? next : item)));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch {
      toast({ title: "Could not update notification.", tone: "error" });
    }
  };

  const markAllRead = async () => {
    try {
      await api.post("/api/v1/notifications/read-all", {});
      const now = Math.floor(Date.now() / 1000);
      setNotifications((prev) =>
        prev.map((item) => (item.read_at ? item : { ...item, read_at: now })),
      );
      setUnreadCount(0);
    } catch {
      toast({ title: "Could not mark notifications read.", tone: "error" });
    }
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h1 className="font-sans text-lg font-semibold">Notifications</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {unreadCount} unread · {notifications.length} total
            </p>
          </div>
          <button
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mark all read
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-sm text-muted-foreground">Loading notifications…</div>
        ) : notifications.length === 0 ? (
          <div className="py-8 text-sm text-muted-foreground">You’re all caught up.</div>
        ) : (
          <ul className="divide-y divide-border">
            {notifications.map((notification) => {
              const unread = !notification.read_at;
              return (
                <li
                  key={notification.id}
                  className={`flex cursor-pointer items-start gap-3 py-4 transition-colors hover:bg-surface ${
                    unread ? "bg-primary/5" : ""
                  }`}
                  onClick={() => void markRead(notification)}
                >
                  <div
                    className={`mt-1 h-2.5 w-2.5 rounded-full ${unread ? "bg-primary" : "bg-muted-foreground/30"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm font-medium">{notification.title}</div>
                      <div className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRelative(notification.created_at)}
                      </div>
                    </div>
                    {notification.body && (
                      <div className="mt-1 text-sm text-muted-foreground">{notification.body}</div>
                    )}
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {notification.type} · {notification.entity_type}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}

function formatRelative(value: number) {
  const ts = value > 10_000_000_000 ? value : value * 1000;
  const diff = Date.now() - ts;
  const minutes = Math.max(1, Math.round(diff / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.max(1, Math.round(minutes / 60));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.max(1, Math.round(hours / 24));
  return `${days}d ago`;
}
