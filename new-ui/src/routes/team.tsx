import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Menu, MenuItem, MenuLabel, MenuDivider } from "@/components/ui/Menu";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Search, Plus, ChevronDown, X, Check, MoreHorizontal, Mail } from "lucide-react";

type Role = "Admin" | "Agent" | "Viewer";
type Member = {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  status: "online" | "offline";
};

const INITIAL: Member[] = [
  {
    id: "1",
    name: "Jane Doe",
    initials: "JD",
    email: "jane@acme.com",
    role: "Admin",
    status: "online",
  },
  {
    id: "2",
    name: "Marcus Weiss",
    initials: "MW",
    email: "marcus@acme.com",
    role: "Agent",
    status: "online",
  },
  {
    id: "3",
    name: "Priya Anand",
    initials: "PA",
    email: "priya@acme.com",
    role: "Agent",
    status: "online",
  },
  {
    id: "4",
    name: "Diego Alvarez",
    initials: "DA",
    email: "diego@acme.com",
    role: "Agent",
    status: "offline",
  },
  {
    id: "5",
    name: "Emma Larsen",
    initials: "EL",
    email: "emma@acme.com",
    role: "Agent",
    status: "online",
  },
  {
    id: "6",
    name: "Kenji Tanaka",
    initials: "KT",
    email: "kenji@acme.com",
    role: "Viewer",
    status: "offline",
  },
];

const ROLES: Role[] = ["Admin", "Agent", "Viewer"];

export default function Team() {
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>(INITIAL);
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("Agent");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [members, query]);

  const online = members.filter((m) => m.status === "online").length;

  const changeRole = (id: string, role: Role) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
    toast({ title: `Role updated to ${role}`, tone: "success" });
  };

  const removeMember = (m: Member) => {
    setMembers((prev) => prev.filter((x) => x.id !== m.id));
    toast({ title: `${m.name} removed`, tone: "error" });
  };

  const invite = () => {
    const email = inviteEmail.trim();
    if (!email) return;
    const name = email
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (s) => s.toUpperCase());
    const initials = name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    setMembers((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name, initials, email, role: inviteRole, status: "offline" },
    ]);
    toast({ title: `Invite sent to ${email}`, tone: "success" });
    setInviteEmail("");
    setInviteRole("Agent");
    setInviteOpen(false);
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        <header className="flex items-center justify-between border-b border-border px-8 py-6">
          <div>
            <h1 className="font-sans text-lg font-semibold">Team</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {members.length} members · {online} online
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search members"
                className="w-48 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <button
              onClick={() => setInviteOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-[var(--primary-hover)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Invite member
            </button>
          </div>
        </header>

        <div className="px-8 py-6">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto] items-center gap-4 border-b border-border pb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <div>Member</div>
            <div>Email</div>
            <div>Role</div>
            <div />
          </div>

          {filtered.length === 0 && (
            <div className="py-10 text-center text-xs text-muted-foreground">
              No members match "{query}".
            </div>
          )}

          {filtered.map((m) => (
            <div
              key={m.id}
              className="group grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto] items-center gap-4 border-b border-border py-3 hover:bg-surface"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-hover text-[11px] font-medium">
                    {m.initials}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${
                      m.status === "online" ? "bg-[var(--success)]" : "bg-muted-foreground"
                    }`}
                  />
                </div>
                <div className="text-sm font-medium">{m.name}</div>
              </div>
              <div className="truncate font-mono text-xs text-muted-foreground">{m.email}</div>
              <div>
                <Menu
                  align="left"
                  trigger={({ toggle }) => (
                    <button
                      onClick={toggle}
                      className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-hover"
                    >
                      {m.role}
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                >
                  {(close) => (
                    <div>
                      <MenuLabel>Change role</MenuLabel>
                      {ROLES.map((r) => (
                        <MenuItem
                          key={r}
                          icon={
                            m.role === r ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <span className="h-3.5 w-3.5" />
                            )
                          }
                          onClick={() => {
                            changeRole(m.id, r);
                            close();
                          }}
                        >
                          {r}
                        </MenuItem>
                      ))}
                    </div>
                  )}
                </Menu>
              </div>
              <Menu
                align="right"
                trigger={({ toggle }) => (
                  <button
                    onClick={toggle}
                    className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-surface-hover hover:text-foreground group-hover:opacity-100"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                )}
              >
                {(close) => (
                  <div>
                    <MenuItem
                      icon={<Mail className="h-3.5 w-3.5" />}
                      onClick={() => {
                        toast({ title: `Message sent to ${m.name.split(" ")[0]}` });
                        close();
                      }}
                    >
                      Send message
                    </MenuItem>
                    <MenuDivider />
                    <MenuItem
                      icon={<X className="h-3.5 w-3.5" />}
                      destructive
                      onClick={() => {
                        removeMember(m);
                        close();
                      }}
                    >
                      Remove from team
                    </MenuItem>
                  </div>
                )}
              </Menu>
            </div>
          ))}

          <div className="pt-4">
            <button
              onClick={() => setInviteOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              Add team member
            </button>
          </div>
        </div>
      </div>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite teammate"
        description="They'll get an email to join your workspace."
        footer={
          <>
            <button
              onClick={() => setInviteOpen(false)}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              onClick={invite}
              disabled={!inviteEmail.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send invite
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Work email</label>
            <input
              type="email"
              autoFocus
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Role</label>
            <div className="flex gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setInviteRole(r)}
                  className={`flex-1 rounded-md border px-2.5 py-1.5 text-xs ${
                    inviteRole === r
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-surface-hover"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
