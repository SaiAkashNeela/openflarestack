import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { Mail, MessageCircle, Globe, Sparkles, Plus, RotateCw, Trash2 } from "lucide-react";
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
  config: string;
  enabled: number | boolean;
  created_at: number | null;
};

type Channel = Template & {
  id: string;
  status: Status;
};

type SetupField = {
  key: string;
  label: string;
  placeholder: string;
  type?: string;
  required?: boolean;
};

const CATALOG: Template[] = [
  {
    type: "email",
    name: "Email",
    description: "Connect a Cloudflare-routed support inbox",
    icon: Mail,
    meta: "Email Routing · send_email",
  },
  {
    type: "telegram",
    name: "Telegram",
    description: "Connect a support bot",
    icon: MessageCircle,
    meta: "Bot API · webhook",
  },
  {
    type: "webchat",
    name: "Web Chat",
    description: "Embed the hosted support widget on your site",
    icon: Globe,
    meta: "Widget · realtime",
  },
  {
    type: "github",
    name: "GitHub",
    description: "Sync issues and comments into conversations",
    icon: Globe,
    meta: "App installation · webhooks",
  },
  {
    type: "discord",
    name: "Discord",
    description: "Route Discord server conversations into the inbox",
    icon: MessageCircle,
    meta: "OAuth · bot",
  },
  {
    type: "openai_compatible",
    name: "OpenAI-Compatible",
    description: "Connect any OpenAI-compatible model endpoint",
    icon: Globe,
    meta: "Base URL · API key",
  },
  {
    type: "cloudflare_ai_gateway",
    name: "Cloudflare AI Gateway",
    description: "Route model traffic through Cloudflare AI Gateway",
    icon: Sparkles,
    meta: "Gateway endpoint · auth",
  },
  {
    type: "webhook",
    name: "Webhook",
    description: "Receive and publish org events through a signed webhook",
    icon: Globe,
    meta: "Outbound events · retries",
  },
];

const SETUP_FIELDS: Record<string, SetupField[]> = {
  email: [
    {
      key: "address",
      label: "Support address",
      placeholder: "support@yourdomain.com",
      required: true,
    },
    { key: "fromName", label: "From name", placeholder: "Flaredesk Support" },
  ],
  telegram: [
    {
      key: "botToken",
      label: "Bot token",
      placeholder: "123456:ABC-DEF...",
      required: true,
    },
    { key: "webhookSecret", label: "Webhook secret", placeholder: "optional secret" },
  ],
  webchat: [
    { key: "siteUrl", label: "Site URL", placeholder: "https://example.com", required: true },
    { key: "widgetKey", label: "Widget key", placeholder: "public widget key", required: true },
    { key: "accent", label: "Accent color", placeholder: "#111827" },
  ],
  github: [
    { key: "appSlug", label: "App slug", placeholder: "acme-support-app", required: true },
    { key: "appId", label: "App ID", placeholder: "123456", required: true },
    { key: "privateKey", label: "Private key", placeholder: "-----BEGIN PRIVATE KEY-----", required: true },
    { key: "owner", label: "Owner", placeholder: "acme-inc", required: true },
    { key: "repository", label: "Repository", placeholder: "support", required: true },
    { key: "webhookSecret", label: "Webhook secret", placeholder: "optional secret" },
  ],
  discord: [
    { key: "guildId", label: "Guild ID", placeholder: "123456789", required: true },
    { key: "channelId", label: "Channel ID", placeholder: "987654321", required: true },
    { key: "clientId", label: "Client ID", placeholder: "Discord client id", required: true },
    { key: "clientSecret", label: "Client secret", placeholder: "Discord client secret", required: true },
    { key: "botToken", label: "Bot token", placeholder: "Bot token", required: true },
    { key: "permissions", label: "Permissions", placeholder: "8" },
    { key: "webhookSecret", label: "Webhook secret", placeholder: "optional secret" },
  ],
  openai_compatible: [
    { key: "baseUrl", label: "Base URL", placeholder: "https://api.example.com/v1", required: true },
    { key: "apiKey", label: "API key", placeholder: "sk-...", required: true },
    { key: "model", label: "Model", placeholder: "gpt-4.1-mini", required: true },
  ],
  cloudflare_ai_gateway: [
    { key: "endpoint", label: "Gateway endpoint", placeholder: "https://gateway.ai.cloudflare.com/v1/...", required: true },
    { key: "authToken", label: "Auth token", placeholder: "Cloudflare token", required: true },
    { key: "model", label: "Model", placeholder: "gpt-4.1-mini", required: true },
    { key: "provider", label: "Provider", placeholder: "openai / anthropic /...", required: false },
  ],
  webhook: [
    { key: "url", label: "Webhook URL", placeholder: "https://example.com/webhook", required: true },
    { key: "secret", label: "Signing secret", placeholder: "optional secret" },
    { key: "events", label: "Events", placeholder: "conversation.created,message.received" },
  ],
};

export default function Integrations() {
  const { toast } = useToast();
  const [connected, setConnected] = useState<Channel[]>([]);
  const [available, setAvailable] = useState<Template[]>(CATALOG);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupTemplate, setSetupTemplate] = useState<Template | null>(null);
  const [setupConfig, setSetupConfig] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

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

  const startSetup = (template?: Template | null) => {
    const next = template ?? null;
    setSetupTemplate(next);
    setSetupConfig(defaultConfig(next?.type ?? "") as Record<string, string>);
    setSetupOpen(true);
  };

  const submitConnect = async () => {
    if (!setupTemplate) return;
    setPending(true);
    try {
      const { integration, connectUrl } = await api.post<{
        integration: WorkerIntegration;
        connectUrl: string | null;
      }>(
        "/api/v1/integrations",
        {
          type: setupTemplate.type,
          name: integrationLabel(setupTemplate.type, setupConfig, setupTemplate.name),
          config: setupConfig,
        },
      );
      if (connectUrl && integration?.id) {
        window.location.assign(getIntegrationConnectUrl(integration.id));
        return;
      }
      const mapped = mapIntegration(
        integration ?? {
          ...setupTemplate,
          id: crypto.randomUUID(),
          enabled: true,
          created_at: null,
        },
      );
      setConnected((prev) => [...prev, mapped]);
      setAvailable((prev) => prev.filter((item) => item.type !== setupTemplate.type));
      setSetupOpen(false);
      setSetupTemplate(null);
      setSetupConfig({});
      toast({ title: `${setupTemplate.name} connected`, tone: "success" });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Channel setup failed",
        tone: "error",
      });
    } finally {
      setPending(false);
    }
  };

  const disconnect = async (c: Channel) => {
    await api.del(`/api/v1/integrations/${c.id}`);
    setConnected((prev) => prev.filter((x) => x.id !== c.id));
    setAvailable((prev) => [...prev, stripChannel(c)]);
    toast({ title: `${c.name} disconnected`, tone: "error" });
  };

  const reauth = (c: Channel) => {
    const nextUrl = getIntegrationConnectUrl(c.id);
    if (nextUrl) {
      window.location.assign(nextUrl);
      return;
    }
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
            onClick={() => startSetup()}
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
                  onClick={() => startSetup(c)}
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
        open={setupOpen}
        onClose={() => {
          setSetupOpen(false);
          setSetupTemplate(null);
          setSetupConfig({});
        }}
        title={setupTemplate ? `Connect ${setupTemplate.name}` : "Add a channel"}
        description={
          setupTemplate
            ? setupTemplate.type === "webhook"
              ? "Use this channel to send tickets from another platform straight into the inbox."
              : setupTemplate.type === "email"
                ? "Route a support address through Cloudflare Email Service, then send replies from the worker."
              : `Enter the details we need to connect ${setupTemplate.name.toLowerCase()}.`
            : "Pick a source to route conversations from."
        }
        footer={
          <button
            onClick={() => {
              setSetupOpen(false);
              setSetupTemplate(null);
              setSetupConfig({});
            }}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-hover"
          >
            {setupTemplate ? "Back" : "Close"}
          </button>
        }
      >
        {setupTemplate ? (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">{setupTemplate.name}</div>
              <div className="mt-1">{setupTemplate.description}</div>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-wider">
                {setupTemplate.meta}
              </div>
            </div>
            {setupTemplate.type === "email" && (
              <div className="space-y-2 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">Cloudflare Email Service setup</div>
                <ul className="list-disc space-y-1 pl-4">
                  <li>Onboard your domain in Cloudflare Email Service.</li>
                  <li>Create an Email Routing rule that sends this address to the Worker.</li>
                  <li>Use the same address below so Flaredesk can match replies to a conversation.</li>
                </ul>
              </div>
            )}
            {setupTemplate.type === "webchat" && (
              <div className="space-y-2 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">Embed snippet</div>
                <div className="font-mono text-[11px] break-all text-foreground">
                  {webchatSnippet(setupConfig.widgetKey || "", setupConfig.siteUrl || "")}
                </div>
                <ul className="list-disc space-y-1 pl-4">
                  <li>Paste the script before the closing `body` tag.</li>
                  <li>The widget keeps a visitor session in local storage.</li>
                  <li>Theme colors can be tuned from the config fields below.</li>
                </ul>
              </div>
            )}
            {(setupTemplate.type === "github" || setupTemplate.type === "discord") && (
              <div className="space-y-2 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">
                  {setupTemplate.type === "github" ? "GitHub App" : "Discord bot"} setup
                </div>
                <ul className="list-disc space-y-1 pl-4">
                  <li>{setupTemplate.type === "github" ? "Use a GitHub App installation and the selected repository details." : "Use a bot token plus the guild and channel you want to sync."}</li>
                  <li>The config below is organization-scoped and can be updated later.</li>
                </ul>
              </div>
            )}
            {(setupTemplate.type === "openai_compatible" || setupTemplate.type === "cloudflare_ai_gateway") && (
              <div className="space-y-2 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">
                  {setupTemplate.type === "openai_compatible"
                    ? "OpenAI-compatible endpoint"
                    : "Cloudflare AI Gateway"}
                </div>
                <ul className="list-disc space-y-1 pl-4">
                  <li>Use the base URL or gateway endpoint that already fronts your model traffic.</li>
                  <li>The model name should match what the upstream endpoint expects.</li>
                </ul>
              </div>
            )}
            {setupTemplate.type === "webhook" ? (
              <div className="space-y-2 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">
                  Send POST requests here after saving
                </div>
                <div className="font-mono text-[11px] break-all text-foreground">
                  {webhookUrl(":integrationId")}
                </div>
                <div className="font-mono text-[11px] break-all text-foreground">
                  {setupConfig.secret ? `X-Flaredesk-Signature: sha256=...` : "Signing is optional but recommended"}
                </div>
                <pre className="overflow-x-auto rounded-md bg-surface p-2 font-mono text-[10px] leading-5 text-muted-foreground">
                  {`{
  "externalCustomerId": "user_123",
  "customerName": "Ada Lovelace",
  "customerEmail": "ada@example.com",
  "subject": "Payment issue",
  "text": "I need help with my invoice",
  "channel": "platform"
}`}
                </pre>
              </div>
            ) : (
              <div className="space-y-3">
                {fieldsForType(setupTemplate.type).map((field) => (
                  <label key={field.key} className="block">
                    <span className="mb-1.5 block text-xs font-medium">
                      {field.label}
                      {field.required ? " *" : ""}
                    </span>
                    <input
                      value={setupConfig[field.key] ?? ""}
                      onChange={(e) =>
                        setSetupConfig((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      type={field.type ?? "text"}
                      placeholder={field.placeholder}
                      className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </label>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  setSetupTemplate(null);
                  setSetupConfig({});
                }}
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-hover"
              >
                Choose another
              </button>
              <button
                onClick={() => void submitConnect()}
                disabled={pending}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Connecting..." : "Connect channel"}
              </button>
            </div>
          </div>
        ) : availableModal.length === 0 ? (
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
                  onClick={() => startSetup(c)}
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

function webhookUrl(id: string) {
  const base = import.meta.env.VITE_API_URL ?? "";
  return `${base.replace(/\/$/, "")}/api/webhooks/${id}`;
}

function webchatSnippet(widgetKey: string, siteUrl: string) {
  const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  const src = `${base}/api/public/webchat/widget.js?widgetKey=${encodeURIComponent(widgetKey)}&baseUrl=${encodeURIComponent(base)}`
  return `<script src="${src}" data-widget-key="${widgetKey}" data-base-url="${base}" data-site-url="${siteUrl}"></script>`
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
  const config = parseConfig(integration.config);

  return {
    id: integration.id,
    type: template.type,
    name: integration.name || template.name,
    description: template.description,
    icon: template.icon,
    meta: formatIntegrationMeta(template.type, config, integration),
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

function parseConfig(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function formatIntegrationMeta(
  type: string,
  config: Record<string, unknown>,
  integration: WorkerIntegration,
) {
  if (!integration.enabled) return "Disabled";
  if (type === "webhook") return `POST ${webhookUrl(integration.id)}`;
  if (type === "webchat") {
    const widgetKey = typeof config.widgetKey === "string" ? config.widgetKey : "";
    return widgetKey ? `Widget key ${widgetKey.slice(0, 8)}…` : "Widget ready";
  }
  if (type === "email") {
    const address = typeof config.address === "string" ? config.address : "";
    return address ? address : `Connected · ${formatDate(integration.created_at)}`;
  }
  if (type === "telegram") {
    const botToken = typeof config.botToken === "string" ? config.botToken : "";
    return botToken ? `Bot ${botToken.slice(0, 4)}…` : `Connected · ${formatDate(integration.created_at)}`;
  }
  if (type === "github") {
    const owner = typeof config.owner === "string" ? config.owner : "";
    const repository = typeof config.repository === "string" ? config.repository : "";
    return owner && repository ? `${owner}/${repository}` : `Connected · ${formatDate(integration.created_at)}`;
  }
  if (type === "discord") {
    const guildId = typeof config.guildId === "string" ? config.guildId : "";
    const channelId = typeof config.channelId === "string" ? config.channelId : "";
    return guildId && channelId ? `Guild ${guildId.slice(0, 6)}… · Channel ${channelId.slice(0, 6)}…` : `Connected · ${formatDate(integration.created_at)}`;
  }
  if (type === "openai_compatible") {
    const baseUrl = typeof config.baseUrl === "string" ? config.baseUrl : "";
    const model = typeof config.model === "string" ? config.model : "";
    return model ? `${model} · ${baseUrl || "OpenAI-compatible"}` : baseUrl || `Connected · ${formatDate(integration.created_at)}`;
  }
  if (type === "cloudflare_ai_gateway") {
    const endpoint = typeof config.endpoint === "string" ? config.endpoint : "";
    const model = typeof config.model === "string" ? config.model : "";
    return model ? `${model} · ${endpoint || "AI Gateway"}` : endpoint || `Connected · ${formatDate(integration.created_at)}`;
  }
  return `Connected · ${formatDate(integration.created_at)}`;
}

function defaultConfig(type: string) {
  switch (type) {
    case "email":
      return { address: "", fromName: "" };
    case "telegram":
      return { botToken: "", webhookSecret: "" };
    case "webchat":
      return {
        siteUrl: "",
        widgetKey: crypto.randomUUID().replace(/-/g, ""),
        accent: "#111827",
      };
    case "github":
      return { appSlug: "", appId: "", privateKey: "", owner: "", repository: "", webhookSecret: "" };
    case "discord":
      return { guildId: "", channelId: "", clientId: "", clientSecret: "", botToken: "", permissions: "", webhookSecret: "" };
    case "openai_compatible":
      return { baseUrl: "", apiKey: "", model: "" };
    case "cloudflare_ai_gateway":
      return { endpoint: "", authToken: "", model: "", provider: "" };
    case "webhook":
      return { url: "", secret: "", events: "" };
    default:
      return {};
  }
}

function fieldsForType(type: string) {
  return SETUP_FIELDS[type] ?? [
    { key: "endpoint", label: "Endpoint", placeholder: "https://example.com", required: true },
    { key: "token", label: "Token", placeholder: "token", required: true },
  ];
}

function integrationLabel(type: string, config: Record<string, string>, fallback: string) {
  if (type === "email") return config.address?.trim() || fallback;
  if (type === "webchat") return config.siteUrl?.trim() || config.widgetKey?.trim() || fallback;
  if (type === "webhook") return config.url?.trim() || fallback;
  if (type === "openai_compatible") return config.model?.trim() || config.baseUrl?.trim() || fallback;
  if (type === "cloudflare_ai_gateway") return config.model?.trim() || config.endpoint?.trim() || fallback;
  if (type === "github") return [config.owner?.trim(), config.repository?.trim()].filter(Boolean).join("/") || fallback;
  if (type === "discord") return [config.guildId?.trim(), config.channelId?.trim()].filter(Boolean).join(" · ") || fallback;
  return fallback;
}

function getIntegrationConnectUrl(id: string) {
  const base = import.meta.env.VITE_API_URL ?? window.location.origin;
  const url = new URL(`/api/v1/integrations/${id}/connect`, base);
  return url.toString();
}
