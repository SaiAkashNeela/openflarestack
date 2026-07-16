import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { Mail, MessageCircle, Globe, Slack, Plus, RotateCw, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Menu, MenuDivider, MenuItem } from "@/components/ui/Menu";

type Status = "online" | "offline" | "error";

type Template = {
  type: string;
  name: string;
  description: string;
  icon: LucideIcon;
  meta: string;
};

type WorkerIntegration = {
  id: string;
  type: string;
  name: string;
  enabled: number | boolean;
  created_at: number | null;
};

type Channel = Template & {
  id: string;
  status: Status;
};

const CATALOG: Template[] = [
  {
    type: "email",
    name: "Email",
    description: "support@acme.com",
    icon: Mail,
    meta: "IMAP · inbox routing",
  },
  {
    type: "telegram",
    name: "Telegram",
    description: "@AcmeSupportBot",
    icon: MessageCircle,
    meta: "Bot API · webhook",
  },
  {
    type: "webchat",
    name: "Web Chat",
    description: "widget on acme.com",
    icon: Globe,
    meta: "Widget · snippet install",
  },
  {
    type: "slack",
    name: "Slack",
    description: "acme-workspace",
    icon: Slack,
    meta: "Workspace app · routing",
  },
  {
    type: "whatsapp",
    name: "WhatsApp Business",
    description: "Cloud API",
    icon: MessageCircle,
    meta: "Cloud API · phone number",
  },
  {
    type: "intercom",
    name: "Intercom import",
    description: "One-way sync",
    icon: Globe,
    meta: "Import · read only",
  },
];

export default function Integrations() {
  const { toast } = useToast();
  const [connected, setConnected] = useState<Channel[]>([]);
  const [available, setAvailable] = useState<Template[]>(CATALOG);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { integrations } = await api.get<{ integrations: WorkerIntegration[] }>(
          "/api/v1/integrations",
        );
        if (cancelled) return;
        const mapped = integrations.map(mapIntegration);
        setConnected(mapped);
        setAvailable(
          CATALOG.filter((item) => !mapped.some((integration) => integration.type === item.type)),
        );
      } catch {
        if (!cancelled) {
          toast({ title: "Worker integrations are unavailable right now." });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const connectedCount = connected.length;
  const availableCount = available.length;

  const connect = async (template: Template) => {
    const { integration } = await api.post<{ integration: WorkerIntegration }>(
      "/api/v1/integrations",
      {
        type: template.type,
        name: template.name,
        config: {},
      },
    );
    const mapped = mapIntegration(
      integration ?? { ...template, id: crypto.randomUUID(), enabled: true, created_at: null },
    );
    setConnected((prev) => [...prev, mapped]);
    setAvailable((prev) => prev.filter((item) => item.type !== template.type));
    toast({ title: `${template.name} connected`, tone: "success" });
  };

  const disconnect = async (c: Channel) => {
    await api.del(`/api/v1/integrations/${c.id}`);
    setConnected((prev) => prev.filter((x) => x.id !== c.id));
    setAvailable((prev) => [...prev, stripChannel(c)]);
    toast({ title: `${c.name} disconnected`, tone: "error" });
  };

  const reauth = (c: Channel) => {
    setConnected((prev) =>
      prev.map((x) =>
        x.id === c.id ? { ...x, status: "online", meta: "Reauthorized locally" } : x,
      ),
    );
    toast({ title: `${c.name} reauthorized`, tone: "success" });
  };

  const availableModal = useMemo(() => available, [available]);

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        <header className="flex items-center justify-between border-b border-border px-8 py-6">
          <div>
            <h1 className="font-sans text-lg font-semibold">Channels</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {connectedCount} connected · {availableCount} available
            </p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-[var(--primary-hover)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add channel
          </button>
        </header>

        <div className="px-8 py-2">
          <div className="pb-2 pt-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Connected · {connected.length}
          </div>
          <ul>
            {connected.map((c) => (
              <ChannelRow
                key={c.id}
                channel={c}
                onReauth={() => reauth(c)}
                onDisconnect={() => disconnect(c)}
                onConfigure={() => toast({ title: `${c.name} settings opened` })}
              />
            ))}
          </ul>

          <div className="pb-2 pt-8 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Available
          </div>
          <ul>
            {available.length === 0 && (
              <li className="py-6 text-xs text-muted-foreground">All channels connected.</li>
            )}
            {available.map((c) => (
              <li
                key={c.type}
                className="group flex items-center gap-4 border-b border-border py-3.5 hover:bg-surface"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface">
                  <c.icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.description}</div>
                </div>
                <button
                  onClick={() => {
                    void connect(c);
                    if (available.length === 1) setAddOpen(false);
                  }}
                  className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-hover"
                >
                  Connect
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a channel"
        description="Pick a source to route conversations from."
        footer={
          <button
            onClick={() => setAddOpen(false)}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-hover"
          >
            Close
          </button>
        }
      >
        {availableModal.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            All available channels are already connected.
          </p>
        ) : (
          <ul className="space-y-1">
            {availableModal.map((c) => (
              <li
                key={c.type}
                className="flex items-center gap-3 rounded-md border border-border p-2.5 hover:bg-surface-hover"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface">
                  <c.icon className="h-4 w-4 text-foreground" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.description}</div>
                </div>
                <button
                  onClick={() => {
                    void connect(c);
                    if (available.length === 1) setAddOpen(false);
                  }}
                  className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-[var(--primary-hover)]"
                >
                  Connect
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </AppLayout>
  );
}

function ChannelRow({
  channel,
  onReauth,
  onDisconnect,
  onConfigure,
}: {
  channel: Channel;
  onReauth: () => void;
  onDisconnect: () => void;
  onConfigure: () => void;
}) {
  const Icon = channel.icon;
  const dot =
    channel.status === "online"
      ? "bg-[var(--success)]"
      : channel.status === "error"
        ? "bg-[var(--error)]"
        : "bg-muted-foreground";
  const statusText =
    channel.status === "online" ? "Online" : channel.status === "error" ? "Error" : "Offline";

  return (
    <li className="group flex items-center gap-4 border-b border-border py-3.5 hover:bg-surface">
      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface">
        <Icon className="h-4 w-4 text-foreground" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{channel.name}</span>
          <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            {statusText}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{channel.description}</div>
      </div>
      <div className="hidden font-mono text-[11px] text-muted-foreground md:block">
        {channel.meta}
      </div>

      {channel.status === "error" && (
        <button
          onClick={onReauth}
          className="rounded-md border border-[var(--error)]/40 px-2.5 py-1 text-xs text-[var(--error)] hover:bg-[var(--error)]/10"
        >
          Reauthorize
        </button>
      )}

      <Menu
        align="right"
        trigger={({ toggle }) => (
          <button
            onClick={toggle}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        )}
      >
        {(close) => (
          <div>
            <MenuItem
              icon={<RotateCw className="h-3.5 w-3.5" />}
              onClick={() => {
                onConfigure();
                close();
              }}
            >
              Configure
            </MenuItem>
            <MenuDivider />
            <MenuItem
              icon={<Trash2 className="h-3.5 w-3.5" />}
              destructive
              onClick={() => {
                onDisconnect();
                close();
              }}
            >
              Disconnect
            </MenuItem>
          </div>
        )}
      </Menu>
    </li>
  );
}

function mapIntegration(integration: WorkerIntegration): Channel {
  const template = CATALOG.find((item) => item.type === integration.type) ?? {
    type: integration.type,
    name: integration.name,
    description: integration.name,
    icon: Globe,
    meta: "Connected",
  };

  return {
    id: integration.id,
    type: template.type,
    name: integration.name || template.name,
    description: template.description,
    icon: template.icon,
    meta: integration.enabled ? `Connected · ${formatDate(integration.created_at)}` : "Disabled",
    status: integration.enabled ? "online" : "offline",
  };
}

function stripChannel(channel: Channel): Template {
  return {
    type: channel.type,
    name: channel.name,
    description: channel.description,
    icon: channel.icon,
    meta: channel.meta,
  };
}

function formatDate(value: number | null) {
  if (!value) return "recently";
  const ts = value > 10_000_000_000 ? value : value * 1000;
  const diff = Date.now() - ts;
  const days = Math.max(1, Math.round(diff / 86_400_000));
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}
