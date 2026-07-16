import { Link, useNavigate } from "react-router-dom";
import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    const { error } = await authClient.signIn.email({
      email,
      password,
      rememberMe: keepSignedIn,
    });
    setPending(false);

    if (error) {
      toast({ title: error.message ?? "Sign in failed", tone: "error" });
      return;
    }

    toast({ title: "Welcome back", tone: "success" });
    const session = await authClient.getSession();
    if (!session.data) {
      setPending(false);
      toast({ title: "Session did not initialize. Please try again.", tone: "error" });
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <AuthShell
      title="Sign in to openflarestack"
      subtitle="Welcome back. Enter your details to continue."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Work email"
          icon={<Mail className="h-3.5 w-3.5" />}
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">Password</label>
            <button
              type="button"
              onClick={() => toast({ title: "Password reset flow is not configured yet" })}
              className="font-mono text-[11px] text-primary hover:underline"
            >
              Forgot?
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type={showPw ? "text" : "password"}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="text-muted-foreground hover:text-foreground"
            >
              {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-border accent-[var(--primary)]"
            checked={keepSignedIn}
            onChange={(e) => setKeepSignedIn(e.target.checked)}
          />
          Keep me signed in on this device
        </label>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-[var(--primary-hover)]"
        >
          {pending ? "Signing in..." : "Sign in"}
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
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        New to openflarestack?{" "}
        <Link to="/signup" className="text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Left brand panel */}
      <aside className="hidden w-1/2 flex-col justify-between border-r border-border bg-surface p-12 lg:flex">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary">
            <span className="text-[11px] font-bold text-primary-foreground">O</span>
          </div>
          <span className="font-sans text-sm font-semibold tracking-tight">openflarestack</span>
        </Link>

        <div className="max-w-md">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Open source · MIT licensed
          </div>
          <h2 className="mt-4 font-sans text-2xl font-semibold leading-snug tracking-tight text-foreground">
            One control room for every customer conversation.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            openflarestack unifies email, Telegram, and web chat into a fast, keyboard-driven inbox
            built for support teams. Self-host it, fork it, make it yours.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6 border-t border-border pt-6 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            GitHub
          </a>
          <a href="#" className="hover:text-foreground">
            Docs
          </a>
          <a href="#" className="hover:text-foreground">
            Community
          </a>
        </div>
      </aside>

      {/* Right form */}
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 inline-flex items-center gap-2 lg:hidden">
            <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary">
              <span className="text-[11px] font-bold text-primary-foreground">O</span>
            </div>
            <span className="font-sans text-sm font-semibold tracking-tight">openflarestack</span>
          </Link>

          <h1 className="font-sans text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>

          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

export function Field({
  label,
  icon,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-foreground">{label}</label>
      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <input
          {...props}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
