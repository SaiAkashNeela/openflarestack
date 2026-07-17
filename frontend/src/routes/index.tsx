import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Menu, MenuItem, MenuLabel, MenuDivider } from "@/components/ui/Menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useOrganizationState } from "@/lib/organization";
import { useWs } from "@/lib/ws";
import {
  MoreHorizontal,
  Paperclip,
  Send,
  Filter,
  Check,
  Clock,
  UserPlus,
  Archive,
  Star,
  Trash2,
  MailOpen,
} from "lucide-react";

type Channel = "email" | "telegram" | "chat";
type Status = "open" | "waiting" | "closed";

type Conversation = {
  id: string;
  customerId: string;
  name: string;
  initials: string;
  subject: string;
  preview: string;
  time: string;
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  unread?: boolean;
  channel: Channel;
  status: Status;
  starred?: boolean;
  assignee?: string;
};

type ApiConversation = {
  id: string;
  customer_id: string;
  subject: string | null;
  channel: string | null;
  status: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_external_id: string | null;
  assigned_to_name: string | null;
  last_message_at: number | null;
  updated_at: number | null;
  created_at: number | null;
  unread: number | boolean | null;
};

type ApiCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  external_id: string | null;
  metadata: string | null;
  created_at: number | null;
  updated_at: number | null;
};

type ApiCustomerConversation = {
  id: string;
  subject: string | null;
  channel: string | null;
  status: string;
  last_message_at: number | null;
  created_at: number | null;
};

type ApiMessage = {
  id: string;
  conversation_id: string;
  organization_id: string;
  sender_type: "customer" | "agent" | "system";
  sender_id: string | null;
  content: string;
  content_type: string;
  created_at: number;
};

type OrgMember = {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    name: string;
    image?: string;
  };
};

type TeamMember = {
  id: string;
  userId: string;
  name: string;
  handle: string;
  email: string;
};

type FilterKey = "all" | Status;
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All conversations" },
  { key: "open", label: "Open" },
  { key: "waiting", label: "Waiting" },
  { key: "closed", label: "Closed" },
];

export default function InboxPage() {
  const { toast } = useToast();
  const { data: session } = authClient.useSession();
  const { activeOrganization: activeOrg } = useOrganizationState();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [customer, setCustomer] = useState<ApiCustomer | null>(null);
  const [customerConversations, setCustomerConversations] = useState<ApiCustomerConversation[]>([]);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { lastMessage, typing } = useWs(selectedId || null);

  const teammates = useMemo(
    () =>
      ((activeOrg?.members as OrgMember[] | undefined) ?? []).map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name || m.user.email,
        handle: mentionHandle(m.user.name || m.user.email),
        email: m.user.email,
      })),
    [activeOrg?.members],
  );
  const query = searchParams.get("q")?.trim().toLowerCase() ?? "";

  useEffect(() => {
    let cancelled = false;

    async function loadConversations() {
      try {
        const { conversations } = await api.get<{ conversations: ApiConversation[] }>(
          "/api/v1/conversations?status=all&limit=50",
        );
        if (cancelled) return;
        const mapped = conversations.map(mapConversation);
        setItems(mapped);
        setSelectedId((prev) => prev || mapped[0]?.id || "");
      } catch {
        if (!cancelled) {
          setItems([]);
          setSelectedId("");
          toast({ title: "Unable to load conversations from the backend.", tone: "error" });
        }
      } finally {
        if (!cancelled) setLoadingConversations(false);
      }
    }

    void loadConversations();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setCustomer(null);
      setCustomerConversations([]);
      return;
    }

    let cancelled = false;

    async function loadMessages() {
      setLoadingMessages(true);
      try {
        const { messages } = await api.get<{ messages: ApiMessage[] }>(
          `/api/v1/messages/${selectedId}`,
        );
        if (!cancelled) {
          setMessages(messages ?? []);
          void syncConversation(selectedId, { readState: "read" }).catch(() => {});
        }
      } catch {
        if (!cancelled) {
          setMessages([]);
          toast({ title: "Unable to load messages for this conversation.", tone: "error" });
        }
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    }

    void loadMessages();
    return () => {
      cancelled = true;
    };
  }, [selectedId, toast]);

  useEffect(() => {
    const customerId = items.find((item) => item.id === selectedId)?.customerId;

    if (!customerId) {
      setCustomer(null);
      setCustomerConversations([]);
      return;
    }

    let cancelled = false;

    async function loadCustomer() {
      setLoadingCustomer(true);
      try {
        const { customer: nextCustomer, conversations: nextConversations } = await api.get<{
          customer: ApiCustomer;
          conversations: ApiCustomerConversation[];
        }>(`/api/v1/customers/${customerId}`);
        if (cancelled) return;
        setCustomer(nextCustomer ?? null);
        setCustomerConversations(nextConversations ?? []);
      } catch {
        if (!cancelled) {
          setCustomer(null);
          setCustomerConversations([]);
          toast({ title: "Unable to load customer details.", tone: "error" });
        }
      } finally {
        if (!cancelled) setLoadingCustomer(false);
      }
    }

    void loadCustomer();
    return () => {
      cancelled = true;
    };
  }, [items, selectedId, toast]);

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === "message.created") {
      setMessages((prev) => {
        const msg = lastMessage.message as ApiMessage | undefined;
        if (!msg?.id) return prev;
        if (prev.some((item) => item.id === msg.id)) return prev;
        if (msg.sender_type === "customer" && msg.conversation_id === selectedId) {
          void syncConversation(msg.conversation_id, { readState: "read" }).catch(() => {});
        }
        return [...prev, msg];
      });
    }

    if (lastMessage.type === "conversation.read_state.changed") {
      const conversationId =
        typeof lastMessage.conversationId === "string" ? lastMessage.conversationId : "";
      if (conversationId) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === conversationId
              ? { ...item, unread: lastMessage.readState !== "read" }
              : item,
          ),
        );
      }
    }

    if (lastMessage.type === "typing") {
      setIsTyping(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setIsTyping(false), 2500);
    }
  }, [lastMessage]);

  useEffect(
    () => () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
    },
    [],
  );

  const visible = useMemo(
    () => {
      let next = filter === "all" ? items : items.filter((c) => c.status === filter);
      if (query) {
        next = next.filter((c) => {
          const haystack = [
            c.name,
            c.subject,
            c.preview,
            c.email,
            c.phone,
            c.externalId,
            c.assignee,
            c.channel,
            c.status,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        });
      }
      return next;
    },
    [items, filter, query],
  );
  const selected = items.find((c) => c.id === selectedId) ?? visible[0] ?? items[0];
  const openCount = items.filter((c) => c.status === "open").length;
  const waitingCount = items.filter((c) => c.status === "waiting").length;

  useEffect(() => {
    const available = visible[0]?.id ?? items[0]?.id ?? "";
    if (selectedId && !visible.some((item) => item.id === selectedId)) {
      setSelectedId(available);
    }
    if (!selectedId && available) {
      setSelectedId(available);
    }
  }, [items, selectedId, visible]);

  const update = (id: string, patch: Partial<Conversation>) =>
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const syncConversation = async (
    id: string,
    patch: { status?: Status; assigned_to?: string | null; readState?: "read" | "unread" },
  ) => {
    await api.patch<{ conversation: ApiConversation }>(`/api/v1/conversations/${id}`, patch);
    update(id, {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.assigned_to !== undefined ? { assignee: patch.assigned_to ?? undefined } : {}),
      ...(patch.readState ? { unread: patch.readState !== "read" } : {}),
    });
  };

  const refreshMessages = async () => {
    if (!selectedId) return;
    const { messages: next } = await api.get<{ messages: ApiMessage[] }>(
      `/api/v1/messages/${selectedId}`,
    );
    setMessages(next ?? []);
  };

  const uploadAttachment = async (file: File) => {
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/uploads`, {
        method: "POST",
        credentials: "include",
        body: form,
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Attachment upload failed");
      }

      return (await res.json()) as { id: string; name: string; url: string };
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Attachment upload failed",
        tone: "error",
      });
      throw error;
    }
  };

  const handleTyping = useCallback(() => {
    typing();
  }, [typing]);

  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1">
        <section className="flex w-full max-w-sm shrink-0 flex-col border-r border-border md:w-96">
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <div>
              <h1 className="font-sans text-sm font-semibold">Inbox</h1>
              <p className="font-mono text-[11px] text-muted-foreground">
                {openCount} open · {waitingCount} waiting
              </p>
            </div>
            <Menu
              align="right"
              trigger={({ toggle, open }) => (
                <button
                  onClick={toggle}
                  className={`flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-hover ${
                    filter !== "all" || open ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Filter className="h-3 w-3" />
                  {FILTERS.find((f) => f.key === filter)!.label}
                </button>
              )}
            >
              {(close) => (
                <div>
                  <MenuLabel>Filter by status</MenuLabel>
                  {FILTERS.map((f) => (
                    <MenuItem
                      key={f.key}
                      icon={
                        filter === f.key ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <span className="h-3.5 w-3.5" />
                        )
                      }
                      onClick={() => {
                        setFilter(f.key);
                        close();
                      }}
                    >
                      {f.label}
                    </MenuItem>
                  ))}
                </div>
              )}
            </Menu>
          </div>

          <ul className="flex-1 overflow-y-auto">
            {loadingConversations && (
              <li className="px-6 py-10 text-center text-xs text-muted-foreground">
                Loading conversations from the backend...
              </li>
            )}
            {!loadingConversations && visible.length === 0 && (
              <li className="px-6 py-10 text-center text-xs text-muted-foreground">
                {query ? "No conversations match this search." : "No conversations match this filter."}
              </li>
            )}
            {visible.map((c) => {
              const active = c.id === selectedId;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => {
                      setSelectedId(c.id);
                      if (c.unread) update(c.id, { unread: false });
                    }}
                    className={`relative flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors ${
                      active ? "bg-surface-hover" : "hover:bg-surface"
                    }`}
                  >
                    {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
                    {c.unread && !active && (
                      <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />
                    )}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[11px] font-medium">
                      {c.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`truncate text-sm ${
                            c.unread
                              ? "font-semibold text-foreground"
                              : "font-medium text-foreground"
                          }`}
                        >
                          {c.name}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {c.time}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-foreground/80">{c.subject}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {c.preview}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <ChannelBadge channel={c.channel} />
                        <StatusBadge status={c.status} />
                        {c.assignee && (
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            · {c.assignee.split(" ")[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="hidden min-w-0 flex-1 flex-col md:flex">
          {selected ? (
            <>
              <ThreadHeader
                conv={selected}
                teammates={teammates}
                onAssign={async (memberId, memberName) => {
                  try {
                    await syncConversation(selected.id, { assigned_to: memberId });
                    update(selected.id, { assignee: memberName });
                    toast({ title: `Assigned to ${memberName}`, tone: "success" });
                  } catch {
                    toast({ title: "Unable to assign conversation", tone: "error" });
                  }
                }}
                onSnooze={async (label) => {
                  try {
                    await syncConversation(selected.id, { status: "waiting" });
                    toast({ title: `Snoozed · ${label}` });
                  } catch {
                    toast({ title: "Unable to snooze conversation", tone: "error" });
                  }
                }}
                onToggleClose={async () => {
                  const next: Status = selected.status === "closed" ? "open" : "closed";
                  try {
                    await syncConversation(selected.id, { status: next });
                    toast({
                      title: next === "closed" ? "Conversation closed" : "Reopened",
                      tone: "success",
                    });
                  } catch {
                    toast({ title: "Unable to update conversation", tone: "error" });
                  }
                }}
                onStar={() => {
                  update(selected.id, { starred: !selected.starred });
                  toast({ title: selected.starred ? "Star removed" : "Starred" });
                }}
                onMarkUnread={async () => {
                  try {
                    await syncConversation(selected.id, { readState: "unread" });
                    toast({ title: "Marked as unread" });
                  } catch {
                    toast({ title: "Unable to mark conversation unread", tone: "error" });
                  }
                }}
                onDelete={() => {
                  setItems((prev) => prev.filter((c) => c.id !== selected.id));
                  toast({ title: "Conversation deleted", tone: "error" });
                }}
              />
              <MessageThread
                customer={selected.name}
                messages={messages}
                currentUserId={session?.user.id ?? null}
                loading={loadingMessages}
              />
              {isTyping && <TypingIndicator />}
              <Composer
                to={selected.name}
                teammates={teammates}
                onTyping={handleTyping}
                onAttachFile={uploadAttachment}
                onSend={async (msg) => {
                  try {
                    await api.post(`/api/v1/messages/${selected.id}`, { content: msg });
                    await refreshMessages();
                    toast({
                      title: `Reply sent to ${selected.name}`,
                      description: msg.slice(0, 60),
                      tone: "success",
                    });
                    update(selected.id, { status: "open", preview: msg, unread: false });
                  } catch {
                    toast({ title: "Unable to send reply", tone: "error" });
                  }
                }}
                onSaveDraft={() => toast({ title: "Draft saved" })}
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Select a conversation to get started.
            </div>
          )}
        </section>

        <aside className="hidden w-[22rem] shrink-0 border-l border-border xl:flex">
          <CustomerPanel
            loading={loadingCustomer}
            customer={customer}
            conversation={selected ?? null}
            organization={activeOrg}
            recentConversations={customerConversations}
          />
        </aside>
      </div>
    </AppLayout>
  );
}

function ChannelBadge({ channel }: { channel: Channel }) {
  const label = { email: "Email", telegram: "Telegram", chat: "Web chat" }[channel];
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map = {
    open: { color: "bg-[var(--success)]", label: "Open" },
    waiting: { color: "bg-[var(--warning)]", label: "Waiting" },
    closed: { color: "bg-muted-foreground", label: "Closed" },
  }[status];
  return (
    <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${map.color}`} />
      {map.label}
    </span>
  );
}

function ThreadHeader({
  conv,
  teammates,
  onAssign,
  onSnooze,
  onToggleClose,
  onStar,
  onMarkUnread,
  onDelete,
}: {
  conv: Conversation;
  teammates: { id: string; userId: string; name: string }[];
  onAssign: (memberId: string, memberName: string) => void;
  onSnooze: (label: string) => void;
  onToggleClose: () => void;
  onStar: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex h-14 items-center justify-between border-b border-border px-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="truncate font-sans text-sm font-semibold">{conv.name}</h2>
          <span className="font-mono text-[11px] text-muted-foreground">·</span>
          <StatusBadge status={conv.status} />
          {conv.assignee && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              · {conv.assignee}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{conv.subject}</p>
      </div>
      <div className="flex items-center gap-2">
        <Menu
          align="right"
          trigger={({ toggle }) => (
            <button
              onClick={toggle}
              className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-hover"
            >
              Assign
            </button>
          )}
        >
          {(close) => (
            <div>
              <MenuLabel>Assign to</MenuLabel>
              {teammates.map((m) => (
                <MenuItem
                  key={m.id}
                  icon={<UserPlus className="h-3.5 w-3.5" />}
                  onClick={() => {
                    onAssign(m.userId, m.name);
                    close();
                  }}
                >
                  {m.name}
                </MenuItem>
              ))}
            </div>
          )}
        </Menu>

        <Menu
          align="right"
          trigger={({ toggle }) => (
            <button
              onClick={toggle}
              className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-hover"
            >
              Snooze
            </button>
          )}
        >
          {(close) => (
            <div>
              <MenuLabel>Snooze until</MenuLabel>
              {["Later today", "Tomorrow", "Next week", "Custom…"].map((label) => (
                <MenuItem
                  key={label}
                  icon={<Clock className="h-3.5 w-3.5" />}
                  onClick={() => {
                    onSnooze(label);
                    close();
                  }}
                >
                  {label}
                </MenuItem>
              ))}
            </div>
          )}
        </Menu>

        <button
          onClick={onToggleClose}
          className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-[var(--primary-hover)]"
        >
          {conv.status === "closed" ? "Reopen" : "Close"}
        </button>

        <Menu
          align="right"
          trigger={({ toggle }) => (
            <button
              onClick={toggle}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
        >
          {(close) => (
            <div>
              <MenuItem
                icon={<Star className="h-3.5 w-3.5" />}
                onClick={() => {
                  onStar();
                  close();
                }}
              >
                {conv.starred ? "Remove star" : "Star conversation"}
              </MenuItem>
              <MenuItem
                icon={<MailOpen className="h-3.5 w-3.5" />}
                onClick={() => {
                  onMarkUnread();
                  close();
                }}
              >
                Mark as unread
              </MenuItem>
              <MenuItem icon={<Archive className="h-3.5 w-3.5" />} onClick={close}>
                Archive
              </MenuItem>
              <MenuDivider />
              <MenuItem
                icon={<Trash2 className="h-3.5 w-3.5" />}
                destructive
                onClick={() => {
                  onDelete();
                  close();
                }}
              >
                Delete
              </MenuItem>
            </div>
          )}
        </Menu>
      </div>
    </div>
  );
}

function mapConversation(conv: ApiConversation): Conversation {
  const name = conv.customer_name || conv.customer_email || "Customer";
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const status: Status =
    conv.status === "waiting"
      ? "waiting"
      : conv.status === "closed" || conv.status === "resolved"
        ? "closed"
      : "open";
  const time = formatConversationTime(conv.last_message_at ?? conv.updated_at ?? conv.created_at);

  return {
    id: conv.id,
    customerId: conv.customer_id,
    name,
    initials,
    subject: conv.subject ?? "Conversation",
    preview: conv.subject ?? conv.channel ?? "New message",
    time,
    email: conv.customer_email,
    phone: conv.customer_phone,
    externalId: conv.customer_external_id,
    channel: normalizeChannel(conv.channel),
    status,
    assignee: conv.assigned_to_name ?? undefined,
    unread: Boolean(conv.unread),
  };
}

function normalizeChannel(channel: string | null): Channel {
  if (channel === "telegram" || channel === "chat" || channel === "email") return channel;
  return "chat";
}

function formatConversationTime(value: number | null) {
  if (!value) return "now";
  const ts = value > 10_000_000_000 ? value : value * 1000;
  const diff = Date.now() - ts;
  const mins = Math.max(1, Math.round(diff / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function MessageThread({
  customer,
  messages,
  currentUserId,
  loading,
}: {
  customer: string;
  messages: ApiMessage[];
  currentUserId: string | null;
  loading: boolean;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {loading && (
          <div className="rounded-md border border-border px-4 py-3 text-xs text-muted-foreground">
            Loading messages...
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            No messages yet for this conversation.
          </div>
        )}
        {messages.map((message) => (
          <MessageGroup
            key={message.id}
            message={message}
            currentUserId={currentUserId}
            customer={customer}
          />
        ))}
      </div>
    </div>
  );
}

function TypingIndicator({ name }: { name?: string }) {
  return (
    <div className="px-6 pb-2">
      <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-full border border-border bg-surface/70 px-4 py-2 text-xs text-muted-foreground">
        <span className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
        <span>{name ? `${name} is typing…` : "Someone is typing…"}</span>
      </div>
    </div>
  );
}

function MessageGroup({
  message,
  currentUserId,
  customer,
}: {
  message: ApiMessage;
  currentUserId: string | null;
  customer: string;
}) {
  const meta = messageMeta(message, currentUserId, customer);
  const borderColor =
    meta.role === "agent"
      ? "border-primary"
      : meta.role === "system"
        ? "border-[var(--success)]"
        : "border-border-strong";
  const bg =
    meta.role === "agent"
      ? "bg-primary/[0.04]"
      : meta.role === "system"
        ? "bg-[var(--success)]/[0.05]"
        : "bg-transparent";

  return (
    <div className={`flex gap-3 border-l-[3px] ${borderColor} ${bg} pl-4 pr-2 py-2`}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[10px] font-medium">
        {meta.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-foreground">{meta.author}</span>
          {meta.label && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
              {meta.label}
            </span>
          )}
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {formatMessageTime(message.created_at)}
          </span>
        </div>
        <p className="mt-1 max-w-[600px] text-sm leading-relaxed text-foreground/90">
          <span className="whitespace-pre-wrap break-words">{renderMessageContent(message.content)}</span>
        </p>
      </div>
    </div>
  );
}

function messageMeta(message: ApiMessage, currentUserId: string | null, customer: string) {
  if (message.sender_type === "customer") {
    return { author: customer, initials: initials(customer), role: "customer" as const, label: "" };
  }

  if (message.sender_type === "system") {
    return {
      author: "System",
      initials: "SY",
      role: "system" as const,
      label: "Auto",
    };
  }

  if (message.sender_id && currentUserId && message.sender_id === currentUserId) {
    return { author: "You", initials: "YO", role: "agent" as const, label: "Agent" };
  }

  return { author: "Agent", initials: "AG", role: "agent" as const, label: "Agent" };
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatMessageTime(value: number) {
  const ts = value > 10_000_000_000 ? value : value * 1000;
  const date = new Date(ts);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function CustomerPanel({
  loading,
  customer,
  conversation,
  organization,
  recentConversations,
}: {
  loading: boolean;
  customer: ApiCustomer | null;
  conversation: Conversation | null;
  organization: { name?: string; slug?: string; members?: unknown[] } | null;
  recentConversations: ApiCustomerConversation[];
}) {
  const memberCount = organization?.members?.length ?? 0;
  const metadata = parseMetadata(customer?.metadata ?? null);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-5">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        <div className="mt-2 space-y-1">
          <div className="text-sm font-medium text-foreground">
            {organization?.name ?? "Workspace"}
          </div>
          <div className="text-xs text-muted-foreground">
            {organization?.slug ?? "workspace"} · {memberCount} members
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {loading ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ) : customer ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                    {initials(customer.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground">{customer.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {customer.email ?? "No email"}
                  </div>
                  {customer.phone && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{customer.phone}</div>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-xs">
                <DetailRow label="External ID" value={customer.external_id ?? "n/a"} />
                <DetailRow label="Customer ID" value={customer.id} mono />
                <DetailRow label="Created" value={formatConversationTime(customer.created_at)} />
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Conversation
              </p>
              <div className="mt-3 space-y-3 text-xs">
                <DetailRow
                  label="Status"
                  value={<Badge variant="outline">{conversation?.status ?? "open"}</Badge>}
                />
                <DetailRow label="Channel" value={conversation?.channel ?? "chat"} />
                <DetailRow label="Subject" value={conversation?.subject ?? "Conversation"} />
                <DetailRow label="Conversation ID" value={conversation?.id ?? "n/a"} mono />
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Details
              </p>
              <div className="mt-3 space-y-3 text-xs">
                {metadata ? (
                  metadata.length > 0 ? (
                    <div className="space-y-2">
                      {metadata.map((entry) => (
                        <div key={entry.key} className="rounded-xl border border-border px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {humanizeMetadataKey(entry.key)}
                          </div>
                          <div className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground">
                            {entry.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">No customer metadata provided.</div>
                  )
                ) : (
                  <div className="text-muted-foreground">No customer metadata provided.</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Recent conversations
              </p>
              <div className="mt-3 space-y-2">
                {recentConversations.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No other conversations yet.</div>
                ) : (
                  recentConversations.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-xl border border-border px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {item.subject ?? "Conversation"}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {item.channel ?? "chat"} ·{" "}
                            {formatConversationTime(item.last_message_at ?? item.created_at)}
                          </div>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {item.status}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border px-4 text-center text-xs text-muted-foreground">
            Select a conversation to view customer and workspace details.
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  alignTop,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  alignTop?: boolean;
}) {
  return (
    <div className={`flex gap-3 ${alignTop ? "items-start" : "items-center"} justify-between`}>
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`max-w-[65%] text-right ${mono ? "font-mono text-[11px]" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}

type MetadataEntry = {
  key: string;
  value: string;
};

function parseMetadata(value: string | null): MetadataEntry[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [{ key: "value", value: formatMetadataValue(parsed) }];
    }
    return Object.entries(parsed as Record<string, unknown>).map(([key, item]) => ({
      key,
      value: formatMetadataValue(item),
    }));
  } catch {
    return [{ key: "value", value }];
  }
}

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function humanizeMetadataKey(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function mentionHandle(value: string) {
  return normalizeMentionHandle(value.replace(/\s+/g, ""));
}

function normalizeMentionHandle(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

function renderMessageContent(content: string) {
  const parts: ReactNode[] = [];
  const pattern = /@([A-Za-z0-9._-]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content))) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    parts.push(
      <span
        key={`${match.index}-${match[1]}`}
        className="rounded bg-primary/10 px-1 py-0.5 font-medium text-primary"
      >
        {match[0]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : content;
}

function Composer({
  to,
  teammates,
  onSend,
  onSaveDraft,
  onTyping,
  onAttachFile,
}: {
  to: string;
  teammates: TeamMember[];
  onSend: (msg: string) => void;
  onSaveDraft: () => void;
  onTyping: () => void;
  onAttachFile: (file: File) => Promise<{ id: string; name: string; url: string }>;
}) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<{ id: string; name: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [mentionState, setMentionState] = useState<{ start: number; end: number; query: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const disabled = value.trim().length === 0 && attachments.length === 0;
  const mentionQuery = mentionState?.query ?? "";
  const suggestions = mentionState
    ? teammates
        .filter((member) => {
          if (!mentionQuery) return true;
          const query = normalizeMentionHandle(mentionQuery);
          return (
            member.handle.includes(query) ||
            member.name.toLowerCase().includes(query) ||
            member.email.toLowerCase().includes(query)
          );
        })
        .slice(0, 5)
    : [];

  const updateMentions = (nextValue: string, cursor: number) => {
    const before = nextValue.slice(0, cursor);
    const at = before.lastIndexOf("@");
    if (at < 0) {
      setMentionState(null);
      return;
    }

    const token = before.slice(at + 1);
    const prev = at > 0 ? before[at - 1] : " ";
    if (!/^[A-Za-z0-9._-]*$/.test(token) || !/\s/.test(prev)) {
      setMentionState(null);
      return;
    }

    setMentionState({ start: at, end: cursor, query: token });
  };

  const insertMention = (member: TeamMember) => {
    if (!mentionState) return;
    const next =
      value.slice(0, mentionState.start) +
      `@${member.handle} ` +
      value.slice(mentionState.end);
    const nextCursor = mentionState.start + member.handle.length + 2;
    setValue(next);
    setMentionState(null);
    onTyping();
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const send = () => {
    const parts = [value.trim()];
    if (attachments.length > 0) {
      const attachmentBlock = attachments
        .map((attachment) => `Attachment: ${attachment.name}\n${attachment.url}`)
        .join("\n\n");
      parts.push(attachmentBlock);
    }
    onSend(parts.filter(Boolean).join("\n\n"));
    setValue("");
    setAttachments([]);
    setMentionState(null);
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const attachment = await onAttachFile(file);
      setAttachments((prev) => [...prev, attachment]);
    } catch {
      // Parent handles the toast; keep the composer usable.
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="border-t border-border px-6 py-4">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-md border border-border bg-background focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
          <textarea
            ref={textareaRef}
            rows={3}
            value={value}
            onChange={(e) => {
              const next = e.target.value;
              setValue(next);
              onTyping();
              updateMentions(next, e.currentTarget.selectionStart ?? next.length);
            }}
            placeholder={`Reply to ${to.split(" ")[0]}…`}
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setMentionState(null);
                return;
              }
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !disabled) {
                e.preventDefault();
                send();
              }
            }}
          />
          {suggestions.length > 0 && (
            <div className="border-t border-border px-2 py-2">
              <div className="mb-1 px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Mention teammate
              </div>
              <div className="space-y-1">
                {suggestions.map((member) => (
                  <button
                    key={member.userId}
                    type="button"
                    onClick={() => insertMention(member)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-hover"
                  >
                    <span className="font-medium">{member.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">@{member.handle}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
              {attachments.map((attachment) => (
                <span
                  key={attachment.id}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-muted-foreground"
                >
                  <span className="max-w-48 truncate">{attachment.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((prev) => prev.filter((item) => item.id !== attachment.id))
                    }
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                title="Attach file"
                disabled={uploading}
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
              <span className="font-mono text-[10px] text-muted-foreground">
                {uploading ? "Uploading attachment..." : "Markdown supported · ⌘↵ to send"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onSaveDraft}
                className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Save draft
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={send}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3 w-3" />
                Send reply
              </button>
            </div>
          </div>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
