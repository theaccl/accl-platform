import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/design/cn";

const variants = {
  /** Full arena inset — default Nexus / hub content rail */
  solid:
    "rounded-[var(--accl-radius-xl)] border border-[var(--accl-border-subtle)] bg-[var(--accl-bg-elevated)]/80 shadow-[var(--accl-shadow-panel)]",
  /** No background — spacing / max-width only */
  ghost: "",
  /** Subtle chrome strip (e.g. under nav) */
  strip:
    "rounded-[var(--accl-radius-lg)] border border-[var(--accl-border-muted)]/80 bg-[var(--accl-bg-elevated)]/90",
} as const;

export type ArenaPanelVariant = keyof typeof variants;

export type ArenaPanelProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  variant?: ArenaPanelVariant;
};

/**
 * Layout primitive — frames hub/game regions without dictating interior components.
 */
export function ArenaPanel({ children, className, variant = "solid", ...rest }: ArenaPanelProps) {
  return (
    <div className={cn(variants[variant], "min-w-0", className)} {...rest}>
      {children}
    </div>
  );
}
