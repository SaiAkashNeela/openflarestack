import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/components/ui/Toast";
import { authClient } from "@/lib/auth-client";
import { Camera } from "lucide-react";

export default function ProfilePage() {
  const { toast } = useToast();
  const { data: session } = authClient.useSession();
  const [name, setName] = useState("Jane Doe");
  const [email, setEmail] = useState("jane@acme.com");
  const [title, setTitle] = useState("Support Lead");
  const [bio, setBio] = useState("Ships fast, replies faster.");

  useEffect(() => {
    if (!session?.user) return;
    setName(session.user.name ?? "Jane Doe");
    setEmail(session.user.email ?? "jane@acme.com");
  }, [session]);

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        <header className="border-b border-border px-8 py-6">
          <h1 className="font-sans text-lg font-semibold">Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How you appear to teammates and customers.
          </p>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            toast({ title: "Profile updated", tone: "success" });
          }}
          className="mx-auto max-w-2xl px-8 py-8"
        >
          <div className="flex items-center gap-4 border-b border-border pb-8">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-hover text-lg font-medium">
                {name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <button
                type="button"
                onClick={() => toast({ title: "Upload not available in demo" })}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>
            <div>
              <div className="text-sm font-medium">{name}</div>
              <div className="font-mono text-xs text-muted-foreground">{email}</div>
            </div>
          </div>

          <div className="space-y-4 py-8">
            <Row label="Full name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Row>
            <Row label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Row>
            <Row label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Row>
            <Row label="Signature">
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </Row>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-6">
            <button
              type="button"
              onClick={() => toast({ title: "Changes discarded" })}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-hover"
            >
              Discard
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-[var(--primary-hover)]"
            >
              Save changes
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-4">
      <label className="pt-2 text-xs font-medium text-foreground">{label}</label>
      <div>{children}</div>
    </div>
  );
}
