/**
 * Recovery (Phase 8) — what to do next when an action or route is missing.
 * Tone matches NexusTrustHint; pair with NexusLinkWrapper when linking out.
 */

export type NexusRecoveryHintProps = {
  message: string;
};

/** Keep in sync with `MSG` in lib/nexus/getNexusHubData.ts (placeholder copy). */
export const HUB_MSG_STANDING_SIGNED_OUT = "Standing context not available.";
export const HUB_MSG_STANDING_OUT_OF_RANGE = "You are currently outside the visible standings range.";

export default function NexusRecoveryHint({ message }: NexusRecoveryHintProps) {
  return (
    <p className="mt-1.5 text-[11px] leading-snug text-gray-400" data-nexus-recovery-hint>
      {message}
    </p>
  );
}
