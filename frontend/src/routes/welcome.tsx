import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/components/ui/Toast";
import { authClient } from "@/lib/auth-client";
import {
  buildOrganizationSlug,
  createOrganizationWithRetry,
  useOrganizationState,
} from "@/lib/organization";
import { Building2, Mail, MessageCircle, ArrowRight } from "lucide-react";

export default function Welcome() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { organizations, activeOrganization: activeOrg } = useOrganizationState();
  const initialName =
    typeof location.state === "object" && location.state && "orgName" in location.state
      ? String((location.state as { orgName?: unknown }).orgName ?? "")
      : "";
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState("");
  const [pending, setPending] = useState(false);

  const needsOrg = (organizations?.length ?? 0) === 0;

  useEffect(() => {
    if (activeOrg?.name) setName(activeOrg.name);
  }, [activeOrg?.name]);

  const createOrg = async () => {
    const orgName = name.trim();
    if (!orgName) return;
    setPending(true);
    const finalSlug = buildOrganizationSlug(slug || orgName);
    const { data, error } = await createOrganizationWithRetry(orgName, finalSlug);

    if (error) {
      setPending(false);
      toast({ title: error.message ?? "Organization creation failed", tone: "error" });
      return;
    }

    toast({ title: "Organization created", tone: "success" });
    if (data?.id) {
      await authClient.organization.setActiveOrganization({ organizationId: data.id }).catch(() => {});
    }
    await Promise.allSettled([
      authClient.organization.listOrganizations.refetch(),
      authClient.organization.activeOrganization.refetch(),
    ]);
    setPending(false);
    navigate("/", { replace: true });
  };

  return (
    <AppLayout>
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-2xl text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface">
            <div className="h-4 w-4 rounded-sm bg-primary" />
          </div>

          <h1 className="mt-6 font-sans text-3xl font-semibold tracking-tight">
            {needsOrg
              ? "Create your organization"
              : `Welcome to ${activeOrg?.name ?? "openflarestack"}`}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {needsOrg
              ? "Your account is ready. Create an organization first, then connect channels and start handling tickets."
              : "Connect a channel or invite teammates to start working from the inbox."}
          </p>

          {needsOrg ? (
            <div className="mx-auto mt-8 max-w-md rounded-2xl border border-border bg-background p-6 text-left">
              <div className="grid gap-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium">Organization name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your company"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium">Slug</span>
                  <input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="your-company"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </label>

                <button
                  onClick={createOrg}
                  disabled={pending || !name.trim()}
                  className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Building2 className="h-4 w-4" strokeWidth={1.75} />
                  {pending ? "Creating..." : "Create organization"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <button
                  onClick={() => navigate("/integrations")}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-[var(--primary-hover)] sm:w-auto"
                >
                  <Mail className="h-4 w-4" strokeWidth={1.75} />
                  Connect Email
                </button>
                <button
                  onClick={() => navigate("/integrations")}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/[0.05] sm:w-auto"
                >
                  <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
                  Connect Telegram
                </button>
              </div>

              <div className="mt-10 border-t border-border pt-6">
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Next steps
                </div>
                <ul className="mt-3 divide-y divide-border text-left">
                  {[
                    {
                      label: "Connect a channel",
                      meta: "Email, Telegram, web chat",
                      to: "/integrations",
                    },
                    { label: "Invite teammates", meta: "Add people to the workspace", to: "/team" },
                    { label: "Open inbox", meta: "Start handling tickets", to: "/" },
                  ].map((s) => (
                    <li key={s.label}>
                      <button
                        onClick={() => navigate(s.to)}
                        className="flex w-full items-center justify-between py-3 text-sm hover:text-primary"
                      >
                        <span>{s.label}</span>
                        <span className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                          {s.meta}
                          <ArrowRight className="h-3 w-3" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
