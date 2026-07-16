import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Menu, MenuItem, MenuLabel, MenuDivider } from "@/components/ui/Menu";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { authClient } from "@/lib/auth-client";
import { useOrganizationState } from "@/lib/organization";
import { Search, Plus, ChevronDown, X, Check, MoreHorizontal, Mail } from "lucide-react";

type Role = "owner" | "admin" | "member";

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

type OrgInvitation = {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  status: string;
  inviterId: string;
  expiresAt: Date;
  createdAt: Date;
};

const ROLES: Role[] = ["owner", "admin", "member"];

export default function Team() {
  const { toast } = useToast();
  const { activeOrganization: activeOrg } = useOrganizationState();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setMembers((activeOrg?.members as OrgMember[] | undefined) ?? []);
    setInvitations((activeOrg?.invitations as OrgInvitation[] | undefined) ?? []);
  }, [activeOrg?.id, activeOrg?.members, activeOrg?.invitations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q),
    );
  }, [members, query]);

  const counts = useMemo(
    () =>
      members.reduce(
        (acc, member) => {
          const role = normalizeRole(member.role);
          acc[role] += 1;
          return acc;
        },
        { owner: 0, admin: 0, member: 0 },
      ),
    [members],
  );

  const createInvite = async () => {
    const email = inviteEmail.trim();
    if (!email || !activeOrg?.id) return;
    setPending(true);
    const { data, error } = await authClient.organization.createInvitation({
      email,
      role: inviteRole,
      organizationId: activeOrg.id,
    });
    setPending(false);

    if (error) {
      toast({ title: error.message ?? "Invite failed", tone: "error" });
      return;
    }

    if (data) {
      setInvitations((prev) => [data as OrgInvitation, ...prev]);
    }
    toast({ title: `Invite sent to ${email}`, tone: "success" });
    setInviteEmail("");
    setInviteRole("member");
    setInviteOpen(false);
  };

  const updateRole = async (member: OrgMember, role: Role) => {
    if (!activeOrg?.id) return;
    const { error } = await authClient.organization.updateMemberRole({
      memberId: member.id,
      role,
      organizationId: activeOrg.id,
    });
    if (error) {
      toast({ title: error.message ?? "Role update failed", tone: "error" });
      return;
    }
    setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role } : m)));
    toast({ title: `Role updated to ${role}`, tone: "success" });
  };

  const removeMember = async (member: OrgMember) => {
    if (!activeOrg?.id) return;
    const { error } = await authClient.organization.removeMember({
      memberIdOrEmail: member.user.email,
      organizationId: activeOrg.id,
    });
    if (error) {
      toast({ title: error.message ?? "Remove failed", tone: "error" });
      return;
    }
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    toast({ title: `${member.user.name} removed`, tone: "success" });
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        <header className="flex items-center justify-between border-b border-border px-8 py-6">
          <div>
            <h1 className="font-sans text-lg font-semibold">Team</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {members.length} members · {counts.owner} owners · {invitations.length} invites
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
            <div>Joined</div>
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
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-hover text-[11px] font-medium">
                  {initials(m.user.name)}
                </div>
                <div className="text-sm font-medium">{m.user.name || "Unnamed member"}</div>
              </div>
              <div className="truncate font-mono text-xs text-muted-foreground">{m.user.email}</div>
              <div>
                <Menu
                  align="left"
                  trigger={({ toggle }) => (
                    <button
                      onClick={toggle}
                      className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-hover"
                    >
                      {normalizeRole(m.role)}
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                >
                  {(close) => (
                    <div>
                      <MenuLabel>Change role</MenuLabel>
                      {ROLES.map((role) => (
                        <MenuItem
                          key={role}
                          icon={
                            normalizeRole(m.role) === role ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <span className="h-3.5 w-3.5" />
                            )
                          }
                          onClick={() => {
                            void updateRole(m, role);
                            close();
                          }}
                        >
                          {role}
                        </MenuItem>
                      ))}
                    </div>
                  )}
                </Menu>
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {formatJoined(m.createdAt)}
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
                        toast({ title: `Drafted a message to ${m.user.name}` });
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
                        void removeMember(m);
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
        description="They'll get an email invitation to join your workspace."
        footer={
          <>
            <button
              onClick={() => setInviteOpen(false)}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              onClick={() => void createInvite()}
              disabled={pending || !inviteEmail.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Sending..." : "Send invite"}
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
              {ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setInviteRole(role)}
                  className={`flex-1 rounded-md border px-2.5 py-1.5 text-xs capitalize ${
                    inviteRole === role
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-surface-hover"
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}

function normalizeRole(role: string): Role {
  if (role === "owner" || role === "admin" || role === "member") return role;
  return "member";
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatJoined(value: Date) {
  const diff = Date.now() - value.getTime();
  const days = Math.max(1, Math.round(diff / 86_400_000));
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}
