import { useEffect, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/components/ui/Toast";
import { authClient } from "@/lib/auth-client";
import { Camera } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function ProfilePage() {
  const { toast } = useToast();
  const { data: session } = authClient.useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [image, setImage] = useState("");
  const [pendingAvatar, setPendingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!session?.user) return;
    setName(session.user.name ?? "");
    setEmail(session.user.email ?? "");
    setImage(session.user.image ?? "");
  }, [session]);

  const uploadAvatar = async (file: File) => {
    setPendingAvatar(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/me/avatar`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Avatar upload failed");
      }
      const { imageUrl } = (await res.json()) as { imageUrl: string };
      const { error } = await authClient.updateUser({
        image: imageUrl,
      });
      if (error) throw new Error(error.message ?? "Avatar update failed");
      setImage(imageUrl);
      toast({ title: "Avatar updated", tone: "success" });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Avatar upload failed",
        tone: "error",
      });
    } finally {
      setPendingAvatar(false);
    }
  };

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
            const nextName = name.trim();
            if (!nextName) {
              toast({ title: "Name is required", tone: "error" });
              return;
            }
            void authClient.updateUser({ name: nextName }).then(({ error }) => {
              if (error) {
                toast({ title: error.message ?? "Profile update failed", tone: "error" });
                return;
              }
              toast({ title: "Profile updated", tone: "success" });
            });
          }}
          className="mx-auto max-w-2xl px-8 py-8"
        >
          <div className="flex items-center gap-4 border-b border-border pb-8">
            <div className="relative">
              <Avatar className="h-16 w-16">
                <AvatarImage src={image || undefined} alt={name} />
                <AvatarFallback className="bg-surface-hover text-lg font-medium">
                  {name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={pendingAvatar}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadAvatar(file);
                  e.currentTarget.value = "";
                }}
              />
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
                readOnly
                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
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
