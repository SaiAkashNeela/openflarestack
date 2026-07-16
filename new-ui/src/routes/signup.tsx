import { Link, useNavigate } from "react-router-dom";
import { useState, type FormEvent } from "react";
import { Mail, Lock, User, Building2 } from "lucide-react";
import { AuthShell, Field } from "./login";
import { useToast } from "@/components/ui/Toast";
import { authClient } from "@/lib/auth-client";
import { Turnstile } from "@/components/ui/Turnstile";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const turnstileToken = String(formData.get("cf-turnstile-response") ?? "").trim();
    if (turnstileSiteKey && !turnstileToken) {
      toast({ title: "Please complete the Turnstile check.", tone: "error" });
      return;
    }
    setPending(true);
    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
      fetchOptions: turnstileToken
        ? {
            headers: {
              "cf-turnstile-response": turnstileToken,
            },
          }
        : undefined,
    });

    if (signUpError) {
      setPending(false);
      toast({ title: signUpError.message ?? "Sign up failed", tone: "error" });
      return;
    }

    let session = await authClient.getSession();
    if (!session.data) {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
        rememberMe: true,
      });

      if (signInError) {
        setPending(false);
        toast({ title: signInError.message ?? "Sign in failed", tone: "error" });
        return;
      }

      session = await authClient.getSession();
      if (!session.data) {
        setPending(false);
        toast({ title: "Session did not initialize. Please try again.", tone: "error" });
        return;
      }
    }

    setPending(false);
    toast({ title: "Workspace created", tone: "success" });
    navigate("/welcome", { replace: true, state: { orgName: workspace || "Workspace" } });
  };

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Set up openflarestack for your team in under two minutes."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Full name"
          icon={<User className="h-3.5 w-3.5" />}
          placeholder="Your name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Work email"
          icon={<Mail className="h-3.5 w-3.5" />}
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Workspace name"
          icon={<Building2 className="h-3.5 w-3.5" />}
          placeholder="Your organization"
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
        />
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">Password</label>
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type={showPw ? "text" : "password"}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="text-muted-foreground hover:text-foreground"
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} />}

        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
          By creating an account you agree to the{" "}
          <span className="text-foreground underline">Terms</span> and{" "}
          <span className="text-foreground underline">Privacy Policy</span>.
        </p>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-[var(--primary-hover)]"
        >
          {pending ? "Creating..." : "Create workspace"}
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
        Already have an account?{" "}
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
