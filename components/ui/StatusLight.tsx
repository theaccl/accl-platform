import type { HTMLAttributes } from "react";

import { cn } from "@/lib/design/cn";

import type { StatusBadgeTone } from "./StatusBadge";

const toneColors: Record<StatusBadgeTone, string> = {
  neutral: "var(--accl-status-neutral)",
  success: "var(--accl-status-success)",
  warning: "var(--accl-status-warning)",
  danger: "var(--accl-status-danger)",
  info: "var(--accl-status-info)",
};

const sizes = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
} as const;

export type StatusLightProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusBadgeTone;
  size?: keyof typeof sizes;
  /** Accessible label when no adjacent text */
  label?: string;
};

/**
 * Indicator dot — use beside labels or in compact lists.
 */
export function StatusLight({
  tone = "neutral",
  size = "sm",
  className,
  label,
  role = label ? "status" : "presentation",
  "aria-label": ariaLabel,
  ...rest
}: StatusLightProps) {
  return (
    <span
      role={role}
      aria-label={ariaLabel ?? label}
      className={cn("inline-block shrink-0 rounded-full ring-1 ring-black/20", sizes[size], className)}
      style={{ backgroundColor: toneColors[tone] }}
      {...rest}
      />
  );
}
