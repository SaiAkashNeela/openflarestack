import { useEffect, useRef, useState, type ReactNode } from "react";

type Align = "left" | "right";

export function Menu({
  trigger,
  children,
  align = "left",
  className = "",
  menuClassName = "",
}: {
  trigger: (opts: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: Align;
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  const toggle = () => setOpen((v) => !v);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {trigger({ open, toggle })}
      {open && (
        <div
          className={`absolute z-50 mt-1 min-w-[180px] overflow-hidden rounded-md border border-border bg-background shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          } ${menuClassName}`}
          role="menu"
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onClick,
  children,
  icon,
  destructive,
  disabled,
}: {
  onClick?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        destructive
          ? "text-[var(--error)] hover:bg-[var(--error)]/10"
          : "text-foreground hover:bg-surface-hover"
      }`}
      role="menuitem"
    >
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="flex-1">{children}</span>
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

export function MenuDivider() {
  return <div className="my-1 border-t border-border" />;
}
