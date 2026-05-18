import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/design/cn";

export type RatingPillProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  /** "p1" | "accl" | omit for generic */
  label?: string;
};

/**
 * Monospace numeric badge — ratings, Elo-style figures, clock budgets in chrome.
 */
export function RatingPill({ children, className, label, title, ...rest }: RatingPillProps) {
  return (
    <span
      title={title ?? label}
      className={cn(
        "font-mono-accl inline-flex items-center rounded-[var(--accl-radius-md)] border border-[var(--accl-border-subtle)]",
        "bg-[var(--accl-bg-elevated)] px-2 py-0.5 text-[length:var(--accl-text-sm)] tabular-nums text-[var(--accl-text-secondary)]",
        "transition-[border-color,background-color] duration-150 ease-out",
        "hover:border-[var(--accl-border-strong)]",
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
