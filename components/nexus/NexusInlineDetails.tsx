import type { ReactNode } from "react";

/** Compact, factual detail block for expandable rows */
export function NexusInlineDetails({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-1.5 border-t border-[#243244]/60 px-3 pb-3 pt-2.5 text-[11px] leading-relaxed text-gray-400">
      {children}
    </div>
  );
}
