import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import {
  Bell,
  Inbox,
  LayoutDashboard,
  Plug,
  Users,
  Sparkles,
  Search,
  Settings,
  User,
  LogOut,
  ChevronsUpDown,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { Menu, MenuItem, MenuDivider, MenuLabel } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { authClient } from "@/lib/auth-client";
import { getAuthToken, setAuthToken } from "@/lib/auth-token";
import { useOrganizationState } from "@/lib/organization";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type NavItem = {
  to: string;
  label: string;
  icon: typeof Inbox;
};

const NAV: NavItem[] = [
  { to: "/", label: "Inbox", icon: Inbox },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/integrations", label: "Channels", icon: Plug },
  { to: "/team", label: "Team", icon: Users },
  { to: "/welcome", label: "Get started", icon: Sparkles },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { pathname, search } = location;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { resolved, toggle } = useTheme();
  const { data: session } = authClient.useSession();
  const { activeOrganization: activeOrg } = useOrganizationState();
  const user = session?.user;
  const orgName = activeOrg?.name ?? "Workspace";
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(search).get("q") ?? "");
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSearchQuery(new URLSearchParams(search).get("q") ?? "");
  }, [search]);

  useEffect(() => {
    const token = session?.session?.token;
    if (!token) return;
    if (getAuthToken() !== token) {
      setAuthToken(token);
    }
  }, [session?.session?.token]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { unreadCount } = await api.get<{ unreadCount: number }>("/api/v1/notifications?limit=1");
        if (!cancelled) setUnreadCount(unreadCount);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    }

    void load();

    const base = import.meta.env.VITE_API_URL ?? window.location.origin;
    const wsUrl = new URL("/api/v1/notifications/ws", base);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(wsUrl.toString());

    socket.addEventListener("message", () => {
      void load();
    });

    return () => {
      cancelled = true;
      socket.close();
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex h-14 items-center justify-between gap-2 border-b border-border px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary">
              <span className="text-[11px] font-bold text-primary-foreground">O</span>
            </div>
            <span className="font-sans text-sm font-semibold tracking-tight">openflarestack</span>
          </div>
          <div className="flex items-center gap-1">
            <Link
              to="/notifications"
              aria-label="Notifications"
              title="Notifications"
              className="relative rounded-md p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              <Bell className="h-4 w-4" strokeWidth={1.75} />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              title={resolved === "dark" ? "Switch to light" : "Switch to dark"}
              className="rounded-md p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            >
              {resolved === "dark" ? (
                <Sun className="h-4 w-4" strokeWidth={1.75} />
              ) : (
                <Moon className="h-4 w-4" strokeWidth={1.75} />
              )}
            </button>
          </div>
        </div>

        <div className="px-3 pt-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  navigate({
                    pathname: "/",
                    search: searchQuery.trim() ? `?q=${encodeURIComponent(searchQuery.trim())}` : "",
                  });
                }
              }}
              placeholder="Search conversations"
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
            <kbd className="font-mono text-[10px] text-muted-foreground">⌘K</kbd>
          </div>
        </div>

        <nav className="mt-4 flex-1 px-2">
          <div className="px-2 pb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Workspace
          </div>
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-surface-hover text-foreground"
                    : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <Menu
            align="left"
            className="w-full"
            trigger={({ toggle, open }) => (
              <button
                onClick={toggle}
                className={`flex w-full items-center gap-2.5 rounded-md px-1 py-1 text-left transition-colors ${
                  open ? "bg-surface-hover" : "hover:bg-surface-hover"
                }`}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? "Account"} />
                  <AvatarFallback className="bg-surface-hover text-xs font-medium">
                    {(user?.name ?? "O")
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{user?.name ?? "Signed in"}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{orgName}</div>
                </div>
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
            menuClassName="bottom-full mb-2 w-[214px]"
          >
            {(close) => (
              <div>
                <MenuLabel>{user?.email ?? "Account"}</MenuLabel>
                <MenuItem
                  icon={<User className="h-3.5 w-3.5" />}
                  onClick={() => {
                    close();
                    navigate("/profile");
                  }}
                >
                  Profile
                </MenuItem>
                <MenuItem
                  icon={<Settings className="h-3.5 w-3.5" />}
                  onClick={() => {
                    close();
                    navigate("/settings");
                  }}
                >
                  Settings
                </MenuItem>
                <MenuDivider />
                <ThemePicker />
                <MenuDivider />
                <MenuItem
                  icon={<LogOut className="h-3.5 w-3.5" />}
                  destructive
                  onClick={async () => {
                    close();
                    await authClient.signOut({
                      fetchOptions: {
                        onSuccess: () => navigate("/login"),
                      },
                    });
                    setAuthToken(null);
                    toast({ title: "Signed out", tone: "success" });
                  }}
                >
                  Sign out
                </MenuItem>
              </div>
            )}
          </Menu>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col h-full min-h-0 overflow-hidden">{children}</main>
    </div>
  );
}

function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const options: { key: "light" | "dark" | "system"; label: string; icon: typeof Sun }[] = [
    { key: "light", label: "Light", icon: Sun },
    { key: "dark", label: "Dark", icon: Moon },
    { key: "system", label: "System", icon: Monitor },
  ];
  return (
    <div className="px-1 py-1">
      <div className="px-2 pb-1 pt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Theme
      </div>
      <div className="flex gap-1 px-1 pb-1">
        {options.map((o) => {
          const Icon = o.icon;
          const active = theme === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => setTheme(o.key)}
              title={o.label}
              className={`flex flex-1 items-center justify-center rounded-md border px-2 py-1 text-[11px] transition-colors ${
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-surface-hover"
              }`}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
