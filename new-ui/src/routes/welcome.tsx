import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/components/ui/Toast";
import { Mail, MessageCircle, ArrowRight } from "lucide-react";

export default function Welcome() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const steps: { label: string; meta: string; to: "/integrations" | "/team" }[] = [
    { label: "Import from Intercom", meta: "5 min", to: "/integrations" },
    { label: "Add web chat widget", meta: "2 min", to: "/integrations" },
    { label: "Invite your team", meta: "1 min", to: "/team" },
  ];

  return (
    <AppLayout>
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface">
            <div className="h-4 w-4 rounded-sm bg-primary" />
          </div>
          <h1 className="mt-6 font-sans text-3xl font-semibold tracking-tight">
            Welcome to openflarestack
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Connect your first channel to start managing customer conversations. You can add more
            channels later.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={() => {
                toast({ title: "Opening email setup" });
                navigate("/integrations");
              }}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-[var(--primary-hover)] sm:w-auto"
            >
              <Mail className="h-4 w-4" strokeWidth={1.75} />
              Connect Email
            </button>
            <button
              onClick={() => {
                toast({ title: "Opening Telegram setup" });
                navigate("/integrations");
              }}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/[0.05] sm:w-auto"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
              Connect Telegram
            </button>
          </div>

          <div className="mt-10 border-t border-border pt-6">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Or start with
            </div>
            <ul className="mt-3 divide-y divide-border text-left">
              {steps.map((s) => (
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
        </div>
      </div>
    </AppLayout>
  );
}
