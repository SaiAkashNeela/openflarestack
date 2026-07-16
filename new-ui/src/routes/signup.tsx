import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Mail, Lock, User, Building2 } from "lucide-react";
import { AuthShell, Field } from "./login";
import { useToast } from "@/components/ui/Toast";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your workspace — FlareDesk" },
      {
        name: "description",
        content: "Start a new FlareDesk workspace and connect your first support channel in minutes.",
      },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Set up FlareDesk for your team in under two minutes."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          toast({ title: "Workspace created", tone: "success" });
          navigate({ to: "/welcome" });
        }}
        className="space-y-4"
      >
        <Field
          label="Full name"
          icon={<User className="h-3.5 w-3.5" />}
          placeholder="Jane Doe"
          autoComplete="name"
        />
        <Field
          label="Work email"
          icon={<Mail className="h-3.5 w-3.5" />}
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
        />
        <Field
          label="Workspace name"
          icon={<Building2 className="h-3.5 w-3.5" />}
          placeholder="Acme Support"
        />
        <Field
          label="Password"
          icon={<Lock className="h-3.5 w-3.5" />}
          type="password"
          placeholder="At least 8 characters"
          autoComplete="new-password"
        />

        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
          By creating an account you agree to the{" "}
          <span className="text-foreground underline">Terms</span> and{" "}
          <span className="text-foreground underline">Privacy Policy</span>.
        </p>

        <button
          type="submit"
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-[var(--primary-hover)]"
        >
          Create workspace
        </button>

        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              or
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            toast({ title: "Signed up with Google", tone: "success" });
            navigate({ to: "/welcome" });
          }}
          className="w-full rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-hover"
        >
          Continue with Google
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
