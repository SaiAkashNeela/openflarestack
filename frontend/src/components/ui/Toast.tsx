import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = {
  id: number;
  title: string;
  description?: string;
  tone?: "default" | "success" | "error";
};

type Ctx = { toast: (t: Omit<Toast, "id">) => void };

const ToastCtx = createContext<Ctx>({ toast: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, ...t }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
        {toasts.map((t) => {
          const border =
            t.tone === "success"
              ? "border-l-[var(--success)]"
              : t.tone === "error"
                ? "border-l-[var(--error)]"
                : "border-l-primary";
          return (
            <div
              key={t.id}
              className={`pointer-events-auto border border-border ${border} border-l-[3px] bg-background px-3 py-2.5 shadow-lg`}
              role="status"
            >
              <div className="text-xs font-semibold text-foreground">{t.title}</div>
              {t.description && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">{t.description}</div>
              )}
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
