import type { ReactNode } from "react";

export type NexusDataStateLabelProps = {
  state: "ready" | "placeholder";
  /** Short reinforcing label; omit default when placeholder message is enough */
  children?: ReactNode;
};

/**
 * Small reinforcing label for missing backend truth — does not replace module copy.
 */
export default function NexusDataStateLabel({ state, children }: NexusDataStateLabelProps) {
  if (state === "ready") return null;
  return (
    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500" role="status">
      {children ?? "Not available"}
    </p>
  );
}
