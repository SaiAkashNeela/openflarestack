import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/components/ui/Toast";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — FlareDesk" },
      { name: "description", content: "Workspace preferences, notifications, and appearance." },
    ],
  }),
  component: SettingsPage,
});

const TABS = ["General", "Notifications", "Appearance", "Security"] as const;
type Tab = (typeof TABS)[number];

function SettingsPage() {
  const [tab, setTab] = useState<Tab>("General");
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  // simple local state for toggles
  const [workspace, setWorkspace] = useState("Acme Support");
  const [tz, setTz] = useState("Europe/Berlin");
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifMentions, setNotifMentions] = useState(true);
  const [notifDigest, setNotifDigest] = useState(false);
  const [density, setDensity] = useState<"compact" | "cozy">("compact");
  const [twofa, setTwofa] = useState(false);

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        <header className="border-b border-border px-8 py-6">
          <h1 className="font-sans text-lg font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure your workspace and account preferences.
          </p>
        </header>

        <div className="flex gap-8 px-8 py-6">
          <nav className="w-44 shrink-0">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  tab === t
                    ? "bg-surface-hover font-medium text-foreground"
                    : "text-muted-foreground hover:bg-surface hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>

          <div className="max-w-xl flex-1">
            {tab === "General" && (
              <Section
                title="General"
                onSave={() => toast({ title: "Workspace saved", tone: "success" })}
              >
                <Field label="Workspace name">
                  <input
                    value={workspace}
                    onChange={(e) => setWorkspace(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </Field>
                <Field label="Timezone">
                  <select
                    value={tz}
                    onChange={(e) => setTz(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    {[
                      "UTC",
                      "Europe/Berlin",
                      "Europe/London",
                      "America/New_York",
                      "America/Los_Angeles",
                      "Asia/Tokyo",
                    ].map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                </Field>
              </Section>
            )}

            {tab === "Notifications" && (
              <Section
                title="Notifications"
                onSave={() => toast({ title: "Notifications updated", tone: "success" })}
              >
                <Toggle
                  label="Email notifications"
                  description="Get an email when a conversation is assigned to you."
                  value={notifEmail}
                  onChange={setNotifEmail}
                />
                <Toggle
                  label="@mentions"
                  description="Notify me when a teammate @mentions me."
                  value={notifMentions}
                  onChange={setNotifMentions}
                />
                <Toggle
                  label="Daily digest"
                  description="Summary of unresolved conversations every morning."
                  value={notifDigest}
                  onChange={setNotifDigest}
                />
              </Section>
            )}

            {tab === "Appearance" && (
              <Section
                title="Appearance"
                onSave={() => toast({ title: "Appearance saved", tone: "success" })}
              >
                <Field label="Theme">
                  <div className="flex gap-2">
                    {(["system", "light", "dark"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setTheme(v)}
                        className={`flex-1 rounded-md border px-2.5 py-1.5 text-xs capitalize ${
                          theme === v
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:bg-surface-hover"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Density">
                  <div className="flex gap-2">
                    {(["compact", "cozy"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setDensity(v)}
                        className={`flex-1 rounded-md border px-2.5 py-1.5 text-xs capitalize ${
                          density === v
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:bg-surface-hover"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </Field>
              </Section>
            )}

            {tab === "Security" && (
              <Section
                title="Security"
                onSave={() => toast({ title: "Security preferences saved", tone: "success" })}
              >
                <Toggle
                  label="Two-factor authentication"
                  description="Require an authenticator code at sign in."
                  value={twofa}
                  onChange={setTwofa}
                />
                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div>
                    <div className="text-sm font-medium">Active sessions</div>
                    <div className="text-xs text-muted-foreground">2 devices signed in.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toast({ title: "Signed out of other sessions", tone: "success" })}
                    className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-hover"
                  >
                    Sign out others
                  </button>
                </div>
              </Section>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Section({
  title,
  children,
  onSave,
}: {
  title: string;
  children: React.ReactNode;
  onSave: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <h2 className="font-sans text-sm font-semibold">{title}</h2>
      <div className="mt-4 space-y-5">{children}</div>
      <div className="mt-8 flex justify-end border-t border-border pt-4">
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-[var(--primary-hover)]"
        >
          Save changes
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          value ? "bg-primary" : "bg-surface-hover"
        }`}
        aria-pressed={value}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform ${
            value ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
