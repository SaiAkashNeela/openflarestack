import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Menu, MenuItem, MenuLabel, MenuDivider } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
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

const INITIAL: Conversation[] = [
  {
    id: "1",
    name: "Sarah Chen",
    initials: "SC",
    subject: "Refund for invoice #4821",
    preview: "Thanks! Just confirming the refund window before we…",
    time: "2h ago",
    unread: true,
    channel: "email",
    status: "waiting",
    assignee: "Jane Doe",
  },
  {
    id: "2",
    name: "Marcus Weiss",
    initials: "MW",
    subject: "API key rotation not working",
    preview: "I tried rotating the key from the dashboard but the old one still…",
    time: "3h ago",
    unread: true,
    channel: "telegram",
    status: "open",
  },
  {
    id: "3",
    name: "Priya Anand",
    initials: "PA",
    subject: "Onboarding call follow-up",
    preview: "Really appreciated the walkthrough. Two quick questions on…",
    time: "5h ago",
    channel: "email",
    status: "open",
  },
  {
    id: "4",
    name: "Diego Alvarez",
    initials: "DA",
    subject: "Webhook signature mismatch",
    preview: "Getting 401 on every webhook since we deployed the new secret.",
    time: "Yesterday",
    channel: "chat",
    status: "open",
  },
  {
    id: "5",
    name: "Emma Larsen",
    initials: "EL",
    subject: "Team seat upgrade",
    preview: "We'd like to add three seats before end of quarter — is there…",
    time: "Yesterday",
    channel: "email",
    status: "closed",
  },
  {
    id: "6",
    name: "Kenji Tanaka",
    initials: "KT",
    subject: "Slack integration questions",
    preview: "Does the Slack app support routing by channel? We have separate…",
    time: "2d ago",
    channel: "telegram",
    status: "open",
  },
  {
    id: "7",
    name: "Amelia Rossi",
    initials: "AR",
    subject: "Feature request: SLA timers",
    preview: "Loving the product. Would pay for per-team SLA timers with alerts.",
    time: "3d ago",
    channel: "email",
    status: "open",
  },
];

const TEAMMATES_FALLBACK = [
  "Jane Doe",
  "Marcus Weiss",
  "Priya Anand",
  "Diego Alvarez",
  "Emma Larsen",
];

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

type FilterKey = "all" | Status;
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All conversations" },
  { key: "open", label: "Open" },
  { key: "waiting", label: "Waiting" },
  { key: "closed", label: "Closed" },
];

export default function InboxPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Conversation[]>(INITIAL);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [teammates, setTeammates] = useState<string[]>(TEAMMATES_FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [{ conversations }, { members }] = await Promise.all([
          api.get<{ conversations: ApiConversation[] }>(
            "/api/v1/conversations?status=all&limit=50",
          ),
          api.get<{ members: { name: string }[] }>("/api/v1/teams"),
        ]);

        if (cancelled) return;
        const mapped = conversations.map(mapConversation);
        setItems(mapped.length ? mapped : []);
        setSelectedId(mapped[0]?.id ?? "");
        setTeammates(
          members
            .map((member) => member.name)
            .filter(Boolean)
            .slice(0, 10) || TEAMMATES_FALLBACK,
        );
      } catch {
        if (!cancelled) {
          toast({ title: "Using local sample inbox until the worker is reachable." });
          setItems(INITIAL);
          setSelectedId(INITIAL[0]?.id ?? "");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((c) => c.status === filter)),
    [items, filter],
  );
  const selected = items.find((c) => c.id === selectedId) ?? visible[0] ?? items[0];

  const openCount = items.filter((c) => c.status === "open").length;
  const waitingCount = items.filter((c) => c.status === "waiting").length;

  const update = (id: string, patch: Partial<Conversation>) =>
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const syncConversation = async (
    id: string,
    patch: { status?: Status; assigned_to?: string | null },
  ) => {
    await api.patch(`/api/v1/conversations/${id}`, patch);
    update(id, {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.assigned_to !== undefined ? { assignee: patch.assigned_to ?? undefined } : {}),
    });
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
            {loading && (
              <li className="px-6 py-10 text-center text-xs text-muted-foreground">
                Loading conversations from the worker...
              </li>
            )}
            {visible.length === 0 && (
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
                      <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-foreground/80">
                        {c.starred && (
                          <Star className="h-3 w-3 shrink-0 fill-[var(--warning)] text-[var(--warning)]" />
                        )}
                        <span className="truncate">{c.subject}</span>
                      </div>
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
                onAssign={async (name) => {
                  await syncConversation(selected.id, { assigned_to: name });
                  toast({ title: `Assigned to ${name}`, tone: "success" });
                }}
                onSnooze={async (label) => {
                  await syncConversation(selected.id, { status: "waiting" });
                  toast({ title: `Snoozed · ${label}` });
                }}
                onToggleClose={async () => {
                  const next: Status = selected.status === "closed" ? "open" : "closed";
                  await syncConversation(selected.id, { status: next });
                  toast({
                    title: next === "closed" ? "Conversation closed" : "Reopened",
                    tone: "success",
                  });
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
              <ThreadBody customer={selected.name} initials={selected.initials} />
              <Composer
                to={selected.name}
                onSend={async (msg) => {
                  await api.post(`/api/v1/messages/${selected.id}`, { content: msg });
                  toast({
                    title: `Reply sent to ${selected.name}`,
                    description: msg.slice(0, 60),
                    tone: "success",
                  });
                  update(selected.id, { status: "open", preview: msg });
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
  teammates: string[];
  onAssign: (name: string) => void;
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
                  key={m}
                  icon={<UserPlus className="h-3.5 w-3.5" />}
                  onClick={() => {
                    onAssign(m);
                    close();
                  }}
                >
                  {m}
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

type Msg = {
  author: string;
  initials: string;
  role: "customer" | "agent" | "automation";
  time: string;
  body: string;
};

function ThreadBody({ customer, initials }: { customer: string; initials: string }) {
  const msgs: Msg[] = [
    {
      author: customer,
      initials,
      role: "customer",
      time: "10:14",
      body: "Hey team — we processed a refund for invoice #4821 but the customer still shows an open balance in our dashboard. Can you check on your side?",
    },
    {
      author: "Automation",
      initials: "AU",
      role: "automation",
      time: "10:14",
      body: "Ticket assigned to Jane Doe. Priority set to High based on keyword 'refund'.",
    },
    {
      author: "Jane Doe",
      initials: "JD",
      role: "agent",
      time: "10:22",
      body: "Thanks for flagging Sarah — looking into it now. Can you confirm the last four of the card the refund was issued to?",
    },
    {
      author: customer,
      initials,
      role: "customer",
      time: "10:41",
      body: "Sure, last four is 4429. The customer said they got a confirmation email but nothing on their statement yet.",
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {msgs.map((m, i) => (
          <MessageGroup key={i} msg={m} />
        ))}
        <TypingIndicator name="Jane" />
      </div>
    </div>
  );
}

function MessageGroup({ msg }: { msg: Msg }) {
  const borderColor =
    msg.role === "agent"
      ? "border-primary"
      : msg.role === "automation"
        ? "border-[var(--success)]"
        : "border-border-strong";
  const bg =
    msg.role === "agent"
      ? "bg-primary/[0.04]"
      : msg.role === "automation"
        ? "bg-[var(--success)]/[0.05]"
        : "bg-transparent";

  return (
    <div className={`flex gap-3 border-l-[3px] ${borderColor} ${bg} pl-4 pr-2 py-2`}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[10px] font-medium">
        {msg.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-foreground">{msg.author}</span>
          {msg.role === "agent" && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
              Agent
            </span>
          )}
          {msg.role === "automation" && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--success)]">
              Auto
            </span>
          )}
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">{msg.time}</span>
        </div>
        <p className="mt-1 max-w-[600px] text-sm leading-relaxed text-foreground/90">{msg.body}</p>
      </div>
    </div>
  );
}

function TypingIndicator({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 pl-4 text-xs text-muted-foreground">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-hover text-[10px] font-medium">
        {name[0]}
      </div>
      <span>{name} is typing</span>
      <span className="ofs-typing-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
    </div>
  );
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
