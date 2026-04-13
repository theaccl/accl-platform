"use client";

import { useId, useState, type ReactNode } from "react";
import { nexusTransition } from "@/components/nexus/NexusHeader";
import { NexusInlineDetails } from "@/components/nexus/NexusInlineDetails";

export type NexusExpandableRowProps = {
  summary: ReactNode;
  details: ReactNode;
  isExpandable: boolean;
  className?: string;
  summaryClassName?: string;
  /** Max height cap for expanded panel (Tailwind class) */
  detailsMaxHeightClass?: string;
};

/**
 * Inline peek expansion — local state only, no URL persistence.
 * Motion-safe transitions; reduced motion minimizes animation.
 */
export default function NexusExpandableRow({
  summary,
  details,
  isExpandable,
  className = "",
  summaryClassName = "",
  detailsMaxHeightClass = "max-h-48",
}: NexusExpandableRowProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (!isExpandable) {
    return <div className={className}>{summary}</div>;
  }

  return (
    <div className={className}>
      <button
        type="button"
        aria-label={open ? "Hide details" : "Show details"}
        aria-expanded={open}
        aria-controls={panelId}
        id={`${panelId}-trigger`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className={`flex w-full items-start gap-2 rounded-lg text-left ${nexusTransition} hover:bg-[#121a28]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111723] motion-reduce:hover:bg-[#0f1420] ${summaryClassName}`}
      >
        <span
          className={`mt-0.5 inline-block shrink-0 text-[10px] text-gray-500 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none ${open ? "motion-safe:rotate-90" : ""}`}
          aria-hidden
        >
          ▸
        </span>
        <span className="min-w-0 flex-1">{summary}</span>
      </button>
      {/* Details sit outside the summary <button>; link clicks here do not toggle expand. */}
      <div
        id={panelId}
        role="region"
        aria-hidden={!open}
        aria-labelledby={`${panelId}-trigger`}
        className={`overflow-hidden ${nexusTransition} motion-safe:duration-150 motion-safe:ease-out ${open ? `${detailsMaxHeightClass} opacity-100` : "max-h-0 opacity-0"} ${!open ? "pointer-events-none" : ""}`}
      >
        <NexusInlineDetails>{details}</NexusInlineDetails>
      </div>
    </div>
  );
}
