import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/design/cn";

const pads = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-6 sm:p-8",
} as const;

export type LeagueCardPadding = keyof typeof pads;

export type LeagueCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padding?: LeagueCardPadding;
  /** Card gradient + shadow; set false for flat inset panels */
  elevated?: boolean;
};

/**
 * Primary content card — arena border, elevated surface, subtle hover border lift.
 */
export function LeagueCard({
  children,
  className,
  padding = "md",
  elevated = true,
  ...rest
}: LeagueCardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--accl-radius-2xl)] border border-[var(--accl-border-subtle)]",
        elevated &&
          "bg-gradient-to-br from-[var(--accl-bg-card)] to-[var(--accl-bg-card-end)] shadow-[var(--accl-shadow-card)]",
        !elevated && "bg-[var(--accl-bg-elevated)] shadow-[var(--accl-shadow-panel)]",
        "transition-[box-shadow,border-color] duration-150 ease-out motion-reduce:transition-none",
        "hover:border-[color:var(--accl-border-strong)] hover:shadow-[var(--accl-shadow-card-hover)]",
        pads[padding],
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Exported surface string for semantic wrappers (e.g. header) that should match LeagueCard. */
export const leagueCardSurfaceClasses = cn(
  "rounded-[var(--accl-radius-2xl)] border border-[var(--accl-border-subtle)]",
  "bg-gradient-to-br from-[var(--accl-bg-card)] to-[var(--accl-bg-card-end)] shadow-[var(--accl-shadow-card)]",
  "transition-[box-shadow,border-color] duration-150 ease-out motion-reduce:transition-none",
  "hover:border-[color:var(--accl-border-strong)] hover:shadow-[var(--accl-shadow-card-hover)]"
);
