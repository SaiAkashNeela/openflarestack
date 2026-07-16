import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — FlareDesk" },
      {
        name: "description",
        content: "Key support metrics: open conversations, response time, team throughput.",
      },
    ],
  }),
  component: Dashboard,
});

type Stat = {
  label: string;
  value: string;
  delta?: string;
  trend?: number[];
  positive?: boolean;
};

const STATS: Stat[] = [
  {
    label: "Open conversations",
    value: "42",
    delta: "+6 vs. last week",
    trend: [12, 18, 15, 22, 28, 34, 42],
    positive: false,
  },
  {
    label: "Avg. response time",
    value: "14 min",
    delta: "−3 min vs. last week",
    trend: [22, 20, 19, 18, 17, 15, 14],
    positive: true,
  },
  {
    label: "Team members online",
    value: "8",
    delta: "of 12 total",
    trend: [5, 6, 6, 7, 8, 8, 8],
  },
  {
    label: "Messages today",
    value: "234",
    delta: "+18% vs. yesterday",
    trend: [140, 160, 155, 180, 200, 220, 234],
    positive: true,
  },
  {
    label: "First response SLA",
    value: "96%",
    delta: "goal: 95%",
    trend: [92, 93, 94, 95, 96, 95, 96],
    positive: true,
  },
  {
    label: "Customer satisfaction",
    value: "4.7",
    delta: "of 5.0 · 128 ratings",
    trend: [4.4, 4.5, 4.5, 4.6, 4.6, 4.7, 4.7],
    positive: true,
  },
];

export default function Dashboard() {
  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        <header className="border-b border-border px-8 py-6">
          <h1 className="font-sans text-lg font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Last 7 days · updated <span className="font-mono">2 min ago</span>
          </p>
        </header>

        <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2">
          {STATS.map((s) => (
            <StatCard key={s.label} stat={s} />
          ))}
        </div>

        <section className="border-t border-border px-8 py-8">
          <h2 className="font-sans text-sm font-semibold">Team activity</h2>
          <p className="mt-1 text-xs text-muted-foreground">Replies sent per agent today</p>
          <div className="mt-6 space-y-3">
            {[
              { name: "Jane Doe", replies: 48, share: 100 },
              { name: "Marcus Weiss", replies: 41, share: 85 },
              { name: "Priya Anand", replies: 33, share: 68 },
              { name: "Diego Alvarez", replies: 27, share: 56 },
              { name: "Emma Larsen", replies: 19, share: 39 },
            ].map((a) => (
              <div key={a.name} className="flex items-center gap-4">
                <div className="w-32 shrink-0 text-xs text-foreground">{a.name}</div>
                <div className="relative h-1.5 flex-1 bg-surface-hover">
                  <div
                    className="absolute inset-y-0 left-0 bg-primary"
                    style={{ width: `${a.share}%` }}
                  />
                </div>
                <div className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">
                  {a.replies}
                </div>
              </div>
            ))}
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
