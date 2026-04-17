/**
 * Trust (Phase 9) — why an item matters; use only with real data (never placeholder-only states).
 * Slightly stronger tone than NexusRecoveryHint; never interactive.
 */

import type { NexusActivityKind } from "@/lib/nexus/types";

export type NexusTrustHintProps = {
  message: string;
};

export const TRUST_LINE_MAX_CHARS = 96;

/** Standing module — expanded panel; distinct from the headline subline above. */
export const STANDING_EXPANDED_TRUST_MESSAGE = "Reflects your current activity level.";

export default function NexusTrustHint({ message }: NexusTrustHintProps) {
  return (
    <p className="mt-1.5 text-[11px] leading-snug text-gray-500" data-nexus-trust-hint>
      {message}
    </p>
  );
}

/** Top card only; keyed by hub card id — no urgency numbers in UI. */
export function trustMessageForTopActionCard(cardId: string): string | null {
  switch (cardId) {
    case "current-games":
      return "Lists every game where you still have a seat — not a single-game shortcut.";
    case "continue-game":
      return "You have an active game in progress.";
    case "tournament-status":
      return "You are participating in an active tournament.";
    case "finished-priority":
      return "You have recent results to review.";
    default:
      return null;
  }
}

/** One hint per tournament row when the user is involved; null for generic rows. */
export function trustMessageForTournamentRow(userHasActiveGame: boolean, userParticipating: boolean): string | null {
  if (userHasActiveGame) return "You have an ongoing game here.";
  if (userParticipating) return "You are currently active in this tournament.";
  return null;
}

/**
 * Expanded activity details only; skip when no handoff (recovery path handles that row).
 * Uses importance only as a threshold — never shown to the user.
 */
export function activityTrustMessage(type: NexusActivityKind, importance: number): string | null {
  if (importance < 5) return null;
  switch (type) {
    case "tournament_update":
      return "This reflects tournament-related activity on the platform.";
    case "game_finished":
      return "This reflects a completed game on record.";
    case "player_advance":
      return "This reflects progression shown in your feed.";
    case "system":
      return "This line highlights a notable system or announcement.";
    default:
      return null;
  }
}
