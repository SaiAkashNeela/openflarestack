import { useEffect } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";

import DashboardPage from "./routes/dashboard";
import InboxPage from "./routes";
import IntegrationsPage from "./routes/integrations";
import LoginPage from "./routes/login";
import ProfilePage from "./routes/profile";
import SettingsPage from "./routes/settings";
import SignupPage from "./routes/signup";
import TeamPage from "./routes/team";
import WelcomePage from "./routes/welcome";

const PAGE_META: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Inbox — openflarestack",
    description:
      "All customer conversations from email, Telegram, and web chat in one unified inbox.",
  },
  "/dashboard": {
    title: "Dashboard — openflarestack",
    description: "Key support metrics: open conversations, response time, team throughput.",
  },
  "/integrations": {
    title: "Channels — openflarestack",
    description:
      "Connect email, Telegram, web chat, and Slack to route conversations into openflarestack.",
  },
  "/team": {
    title: "Team — openflarestack",
    description: "Manage teammates, roles, and permissions across your openflarestack workspace.",
  },
  "/welcome": {
    title: "Welcome — openflarestack",
    description:
      "Connect your first channel to start managing customer conversations in openflarestack.",
  },
  "/login": {
    title: "Sign in — openflarestack",
    description: "Sign in to your openflarestack workspace to manage customer conversations.",
  },
  "/signup": {
    title: "Create your workspace — openflarestack",
    description:
      "Start a new openflarestack workspace and connect your first support channel in minutes.",
  },
  "/profile": {
    title: "Profile — openflarestack",
    description: "Manage your openflarestack profile and personal preferences.",
  },
  "/settings": {
    title: "Settings — openflarestack",
    description: "Workspace preferences, notifications, and appearance.",
  },
  "*": {
    title: "Not found — openflarestack",
    description: "The page you tried to open does not exist in openflarestack.",
  },
};

function MetaSync() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = PAGE_META[pathname] ?? PAGE_META["*"];
    document.title = meta.title;

    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.setAttribute("name", "description");
      document.head.appendChild(description);
    }
    description.setAttribute("content", meta.description);
  }, [pathname]);

  return null;
}

export default function App() {
  return (
    <>
      <MetaSync />
      <Routes>
        <Route path="/" element={<InboxPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-semibold text-foreground">404</h1>
        <h2 className="mt-4 text-lg font-medium text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This route does not exist in openflarestack.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-[var(--primary-hover)]"
          >
            Back to inbox
          </Link>
        </div>
      </div>
    </div>
  );
}

export { PAGE_META };
