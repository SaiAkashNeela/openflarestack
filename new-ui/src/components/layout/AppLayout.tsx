import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import {
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
import { useTheme } from "@/lib/theme";

type NavItem = {
  to: string;
  label: string;
  icon: typeof Inbox;
  count?: number;
};

const NAV: NavItem[] = [
  { to: "/", label: "Inbox", icon: Inbox, count: 42 },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/integrations", label: "Channels", icon: Plug },
  { to: "/team", label: "Team", icon: Users },
  { to: "/welcome", label: "Get started", icon: Sparkles },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { resolved, toggle } = useTheme();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex h-14 items-center justify-between gap-2 border-b border-border px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary">
              <span className="text-[11px] font-bold text-primary-foreground">O</span>
            </div>
            <span className="font-sans text-sm font-semibold tracking-tight">openflarestack</span>
          </div>
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

        <div className="px-3 pt-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Search"
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
                {item.count !== undefined && (
                  <span className="font-mono text-[11px] text-muted-foreground">{item.count}</span>
                )}
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
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-hover text-xs font-medium">
                  JD
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">Jane Doe</div>
                  <div className="truncate text-[11px] text-muted-foreground">Acme Support</div>
                </div>
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
            menuClassName="bottom-full mb-2 w-[214px]"
          >
            {(close) => (
              <div>
                <MenuLabel>jane@acme.com</MenuLabel>
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
                  onClick={() => {
                    close();
                    toast({ title: "Signed out", tone: "success" });
                    navigate("/login");
                  }}
                >
                  Sign out
                </MenuItem>
              </div>
            )}
          </Menu>

          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
            <Link
              to="/login"
              className="flex-1 rounded-md border border-border px-2 py-1 text-center text-[11px] font-medium hover:bg-surface-hover"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="flex-1 rounded-md bg-primary px-2 py-1 text-center text-[11px] font-medium text-primary-foreground hover:bg-[var(--primary-hover)]"
            >
              Sign up
            </Link>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
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
