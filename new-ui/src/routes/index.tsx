import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Menu, MenuItem, MenuLabel, MenuDivider } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useOrganizationState } from "@/lib/organization";
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
  name: string;
  initials: string;
  subject: string;
  preview: string;
  time: string;
  unread?: boolean;
  channel: Channel;
  status: Status;
  starred?: boolean;
  assignee?: string;
};

type ApiConversation = {
  id: string;
  subject: string | null;
  channel: string | null;
  status: string;
  customer_name: string;
  customer_email: string | null;
  assigned_to_name: string | null;
  last_message_at: number | null;
  updated_at: number | null;
  created_at: number | null;
};

type ApiMessage = {
  id: string;
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
  const [items, setItems] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const teammates = useMemo(
    () =>
      ((activeOrg?.members as OrgMember[] | undefined) ?? []).map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name || m.user.email,
      })),
    [activeOrg?.members],
  );

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
          toast({ title: "Unable to load conversations from the worker.", tone: "error" });
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
      return;
    }

    let cancelled = false;

    async function loadMessages() {
      setLoadingMessages(true);
      try {
        const { messages } = await api.get<{ messages: ApiMessage[] }>(
          `/api/v1/messages/${selectedId}`,
        );
        if (!cancelled) setMessages(messages ?? []);
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

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((c) => c.status === filter)),
    [items, filter],
  );
  const selected = items.find((c) => c.id === selectedId) ?? visible[0] ?? items[0];
  const openCount = items.filter((c) => c.status === "open").length;
  const waitingCount = items.filter((c) => c.status === "waiting").length;

  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]?.id ?? "");
    }
  }, [items, selectedId]);

  const update = (id: string, patch: Partial<Conversation>) =>
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const syncConversation = async (
    id: string,
    patch: { status?: Status; assigned_to?: string | null },
  ) => {
    await api.patch<{ conversation: ApiConversation }>(`/api/v1/conversations/${id}`, patch);
    update(id, {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.assigned_to !== undefined ? { assignee: patch.assigned_to ?? undefined } : {}),
    });
  };

  const refreshMessages = async () => {
    if (!selectedId) return;
    const { messages: next } = await api.get<{ messages: ApiMessage[] }>(
      `/api/v1/messages/${selectedId}`,
    );
    setMessages(next ?? []);
  };

  return (
    <AppLayout>
      <div className="flex h-screen min-h-0 flex-1">
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
                Loading conversations from the worker...
              </li>
            )}
            {!loadingConversations && visible.length === 0 && (
              <li className="px-6 py-10 text-center text-xs text-muted-foreground">
                No conversations match this filter.
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
                onMarkUnread={() => {
                  update(selected.id, { unread: true });
                  toast({ title: "Marked as unread" });
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
              <Composer
                to={selected.name}
                onSend={async (msg) => {
                  try {
                    await api.post(`/api/v1/messages/${selected.id}`, { content: msg });
                    await refreshMessages();
                    toast({
                      title: `Reply sent to ${selected.name}`,
                      description: msg.slice(0, 60),
                      tone: "success",
                    });
                    update(selected.id, { status: "open", preview: msg });
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
    conv.status === "waiting" || conv.status === "closed" || conv.status === "resolved"
      ? "closed"
      : "open";
  const time = formatConversationTime(conv.last_message_at ?? conv.updated_at ?? conv.created_at);

  return {
    id: conv.id,
    name,
    initials,
    subject: conv.subject ?? "Conversation",
    preview: conv.subject ?? conv.channel ?? "New message",
    time,
    channel: normalizeChannel(conv.channel),
    status,
    assignee: conv.assigned_to_name ?? undefined,
    unread: status !== "closed",
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
          {message.content}
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

function Composer({
  to,
  onSend,
  onSaveDraft,
}: {
  to: string;
  onSend: (msg: string) => void;
  onSaveDraft: () => void;
}) {
  const [value, setValue] = useState("");
  const disabled = value.trim().length === 0;

  return (
    <div className="border-t border-border px-6 py-4">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-md border border-border bg-background focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
          <textarea
            rows={3}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`Reply to ${to.split(" ")[0]}…`}
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !disabled) {
                e.preventDefault();
                onSend(value);
                setValue("");
              }
            }}
          />
          <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
            <div className="flex items-center gap-1">
              <button
                onClick={onSaveDraft}
                className="rounded p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                title="Attach file"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
              <span className="font-mono text-[10px] text-muted-foreground">
                Markdown supported · ⌘↵ to send
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onSaveDraft}
                className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Save draft
              </button>
              <button
                disabled={disabled}
                onClick={() => {
                  onSend(value);
                  setValue("");
                }}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3 w-3" />
                Send reply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
