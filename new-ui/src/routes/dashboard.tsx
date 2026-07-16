import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { api } from "@/lib/api";

type Stat = {
  label: string;
  value: string;
  delta?: string;
  trend?: number[];
  positive?: boolean;
};

type WorkerStats = {
  open: number;
  resolved: number;
  today: number;
};

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "Agent" | "Viewer";
  created_at: number | null;
};

const BASE_STATS: Stat[] = [
  {
    label: "Open conversations",
    value: "0",
    delta: "Live from the worker",
    trend: [12, 18, 15, 22, 28, 34, 42],
    positive: false,
  },
  {
    label: "Resolved conversations",
    value: "0",
    delta: "Closed conversations",
    trend: [22, 20, 19, 18, 17, 15, 14],
    positive: true,
  },
  {
    label: "Conversations today",
    value: "0",
    delta: "Created in the workspace today",
    trend: [140, 160, 155, 180, 200, 220, 234],
    positive: true,
  },
  {
    label: "Team members",
    value: "0",
    delta: "Synced from /api/v1/teams",
    trend: [5, 6, 6, 7, 8, 8, 8],
  },
  {
    label: "Admins",
    value: "0",
    delta: "Role distribution",
    trend: [2, 2, 2, 3, 3, 3, 3],
    positive: true,
  },
  {
    label: "Agents",
    value: "0",
    delta: "Role distribution",
    trend: [5, 6, 6, 6, 7, 7, 7],
    positive: true,
  },
];

export default function Dashboard() {
  const [stats, setStats] = useState<WorkerStats>({ open: 0, resolved: 0, today: 0 });
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [statsRes, teamRes] = await Promise.all([
          api.get<WorkerStats>("/api/v1/conversations/stats"),
          api.get<{ members: TeamMember[] }>("/api/v1/teams"),
        ]);

        if (cancelled) return;
        setStats(statsRes);
        setMembers(teamRes.members ?? []);
      } catch {
        if (!cancelled) {
          setStats({ open: 0, resolved: 0, today: 0 });
          setMembers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const roleCounts = useMemo(
    () =>
      members.reduce(
        (acc, member) => {
          acc[member.role.toLowerCase() as keyof typeof acc] += 1;
          return acc;
        },
        { admin: 0, agent: 0, viewer: 0 },
      ),
    [members],
  );

  const cards = [
    { ...BASE_STATS[0], value: String(stats.open) },
    { ...BASE_STATS[1], value: String(stats.resolved) },
    { ...BASE_STATS[2], value: String(stats.today) },
    { ...BASE_STATS[3], value: String(members.length) },
    { ...BASE_STATS[4], value: String(roleCounts.admin) },
    { ...BASE_STATS[5], value: String(roleCounts.agent) },
  ];

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        <header className="border-b border-border px-8 py-6">
          <h1 className="font-sans text-lg font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Last 7 days · {loading ? "syncing worker data" : "updated from the worker"}
          </p>
        </header>

        <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2">
          {cards.map((s) => (
            <StatCard key={s.label} stat={s} />
          ))}
        </div>

        <section className="border-t border-border px-8 py-8">
          <h2 className="font-sans text-sm font-semibold">Team roster</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Members synced from <span className="font-mono">/api/v1/teams</span>
          </p>
          <div className="mt-6 divide-y divide-border">
            {members.length === 0 ? (
              <div className="py-8 text-xs text-muted-foreground">
                No teammates were returned by the worker.
              </div>
            ) : (
              members.slice(0, 6).map((member) => (
                <div key={member.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium">{member.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {member.email}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-foreground">
                      {member.role}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {formatJoined(member.created_at)}
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

function StatCard({ stat }: { stat: Stat }) {
  return (
    <div className="bg-background px-8 py-6">
      <div className="text-xs text-muted-foreground">{stat.label}</div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div className="font-sans text-5xl font-semibold tracking-tight tabular-nums">
          {stat.value}
        </div>
        {stat.trend && <Sparkline data={stat.trend} positive={stat.positive} />}
      </div>
      {stat.delta && (
        <div
          className={`mt-2 font-mono text-[11px] ${
            stat.positive === undefined
              ? "text-muted-foreground"
              : stat.positive
                ? "text-[var(--success)]"
                : "text-[var(--warning)]"
          }`}
        >
          {stat.delta}
        </div>
      )}
    </div>
  );
}

function Sparkline({ data, positive }: { data: number[]; positive?: boolean }) {
  const w = 120;
  const h = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color =
    positive === undefined
      ? "var(--muted-foreground)"
      : positive
        ? "var(--success)"
        : "var(--primary)";

  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function formatJoined(value: number | null) {
  if (!value) return "Joined recently";
  const ts = value > 10_000_000_000 ? value : value * 1000;
  const diff = Date.now() - ts;
  const days = Math.max(1, Math.round(diff / 86_400_000));
  if (days < 30) return `Joined ${days}d ago`;
  const months = Math.round(days / 30);
  return `Joined ${months}mo ago`;
}
