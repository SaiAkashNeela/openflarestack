import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

type Ctx = {
  theme: Theme;
  resolved: Resolved;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeCtx = createContext<Ctx>({
  theme: "system",
  resolved: "light",
  setTheme: () => {},
  toggle: () => {},
});

const STORAGE_KEY = "openflarestack-theme";

function systemPref(): Resolved {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(resolved: Resolved) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<Resolved>("light");

  // Load stored theme on mount
  useEffect(() => {
    const stored =
      (typeof localStorage !== "undefined"
        ? (localStorage.getItem(STORAGE_KEY) as Theme | null)
        : null) ?? "system";
    setThemeState(stored);
  }, []);

  // Resolve + apply whenever theme changes or system pref changes
  useEffect(() => {
    const next: Resolved = theme === "system" ? systemPref() : theme;
    setResolved(next);
    apply(next);

    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const r: Resolved = mql.matches ? "dark" : "light";
      setResolved(r);
      apply(r);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) setThemeState(e.newValue as Theme);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // ignore
    }
  };

  const toggle = () => setTheme(resolved === "dark" ? "light" : "dark");

  return (
    <ThemeCtx.Provider value={{ theme, resolved, setTheme, toggle }}>{children}</ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}
