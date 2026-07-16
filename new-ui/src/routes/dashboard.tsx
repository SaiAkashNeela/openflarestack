import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { useOrganizationState } from "@/lib/organization";

type WorkerStats = {
  open: number;
  resolved: number;
  today: number;
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

type Card = {
  label: string;
  value: string;
  note: string;
};

export default function Dashboard() {
  const { activeOrganization: activeOrg } = useOrganizationState();
  const [stats, setStats] = useState<WorkerStats>({ open: 0, resolved: 0, today: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await api.get<WorkerStats>("/api/v1/conversations/stats");
        if (cancelled) return;
        setStats(data);
      } catch {
        if (!cancelled) setStats({ open: 0, resolved: 0, today: 0 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const members = (activeOrg?.members as OrgMember[] | undefined) ?? [];
  const invites = activeOrg?.invitations?.length ?? 0;

  const cards = useMemo<Card[]>(
    () => [
      { label: "Open conversations", value: String(stats.open), note: "From the worker" },
      { label: "Resolved conversations", value: String(stats.resolved), note: "From the worker" },
      { label: "Conversations today", value: String(stats.today), note: "Created today" },
      { label: "Team members", value: String(members.length), note: "From the active org" },
      { label: "Pending invites", value: String(invites), note: "Waiting to be accepted" },
      { label: "Organization", value: activeOrg?.name ?? "None", note: activeOrg?.slug ?? "" },
    ],
    [
      activeOrg?.name,
      activeOrg?.slug,
      invites,
      members.length,
      stats.open,
      stats.resolved,
      stats.today,
    ],
  );

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        <header className="border-b border-border px-8 py-6">
          <h1 className="font-sans text-lg font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Loading live workspace data" : "Live workspace data"}
          </p>
        </header>

        <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2">
          {cards.map((card) => (
            <StatCard key={card.label} card={card} />
          ))}
        </div>

        <section className="border-t border-border px-8 py-8">
          <h2 className="font-sans text-sm font-semibold">Team roster</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The same members used for assignments and invites.
          </p>
          <div className="mt-6 divide-y divide-border">
            {members.length === 0 ? (
              <div className="py-8 text-xs text-muted-foreground">
                No members are available yet.
              </div>
            ) : (
              members.slice(0, 6).map((member) => (
                <div key={member.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium">{member.user.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {member.user.email}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-foreground">
                      {normalizeRole(member.role)}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {formatJoined(member.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function StatCard({ card }: { card: Card }) {
  return (
    <div className="bg-background px-8 py-6">
      <div className="text-xs text-muted-foreground">{card.label}</div>
      <div className="mt-3 font-sans text-5xl font-semibold tracking-tight tabular-nums">
        {card.value}
      </div>
      <div className="mt-2 font-mono text-[11px] text-muted-foreground">{card.note}</div>
    </div>
  );
}

function normalizeRole(role: string) {
  if (role === "owner" || role === "admin" || role === "member") return role;
  return role;
}

function formatJoined(value: Date) {
  const diff = Date.now() - value.getTime();
  const days = Math.max(1, Math.round(diff / 86_400_000));
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}
