import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/design/cn";

export type StatusBadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const tones: Record<
  StatusBadgeTone,
  { bg: string; fg: string; border: string }
> = {
  neutral: {
    bg: "var(--accl-status-neutral-muted)",
    fg: "var(--accl-text-secondary)",
    border: "rgba(148, 163, 184, 0.35)",
  },
  success: {
    bg: "var(--accl-status-success-muted)",
    fg: "var(--accl-status-success)",
    border: "rgba(34, 197, 94, 0.35)",
  },
  warning: {
    bg: "var(--accl-status-warning-muted)",
    fg: "var(--accl-status-warning)",
    border: "rgba(234, 179, 8, 0.4)",
  },
  danger: {
    bg: "var(--accl-status-danger-muted)",
    fg: "var(--accl-status-danger)",
    border: "rgba(239, 68, 68, 0.4)",
  },
  info: {
    bg: "var(--accl-status-info-muted)",
    fg: "var(--accl-status-info)",
    border: "rgba(56, 189, 248, 0.35)",
  },
};

export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  tone?: StatusBadgeTone;
};

export function StatusBadge({ children, className, tone = "neutral", style, ...rest }: StatusBadgeProps) {
  const t = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--accl-radius-pill)] border px-2 py-0.5",
        "text-[length:var(--accl-text-2xs)] font-semibold uppercase tracking-[var(--accl-tracking-wide)]",
        "transition-colors duration-150 ease-out",
        className
      )}
      style={{
        backgroundColor: t.bg,
        color: t.fg,
        borderColor: t.border,
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
