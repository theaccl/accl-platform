import { test, expect } from "@playwright/test";

import type { NexusActivityKind } from "@/lib/nexus/types";
import {
  TRUST_LINE_MAX_CHARS,
  STANDING_EXPANDED_TRUST_MESSAGE,
  activityTrustMessage,
  trustMessageForTopActionCard,
  trustMessageForTournamentRow,
} from "@/components/nexus/NexusTrustHint";

const ALL_ACTIVITY_KINDS: NexusActivityKind[] = ["game_finished", "tournament_update", "player_advance", "system"];

test.describe("NEXUS Phase 9 trust signals", () => {
  test("top action card trust lines only for high-signal ids", () => {
    expect(trustMessageForTopActionCard("current-games")).toContain("seat");
    expect(trustMessageForTopActionCard("continue-game")).toContain("active game");
    expect(trustMessageForTopActionCard("tournament-status")).toContain("participating");
    expect(trustMessageForTopActionCard("finished-priority")).toContain("recent results");
    expect(trustMessageForTopActionCard("profile")).toBeNull();
    expect(trustMessageForTopActionCard("login")).toBeNull();
  });

  test("tournament trust only when user is involved", () => {
    expect(trustMessageForTournamentRow(true, false)).toBeTruthy();
    expect(trustMessageForTournamentRow(false, true)).toBeTruthy();
    expect(trustMessageForTournamentRow(false, false)).toBeNull();
  });

  test("activity trust only when importance is high enough and type maps to copy", () => {
    expect(activityTrustMessage("game_finished", 4)).toBeNull();
    expect(activityTrustMessage("game_finished", 5)).toBeTruthy();
    expect(activityTrustMessage("system", 5)).toBeTruthy();
  });

  test("activity trust omitted when importance below internal threshold", () => {
    expect(activityTrustMessage("tournament_update", 3)).toBeNull();
  });

  test("trust copy stays within length budget and exposes no numeric scores", () => {
    const samples = [
      trustMessageForTopActionCard("continue-game"),
      trustMessageForTournamentRow(true, false),
      STANDING_EXPANDED_TRUST_MESSAGE,
    ].filter(Boolean) as string[];

    for (const kind of ALL_ACTIVITY_KINDS) {
      const m = activityTrustMessage(kind, 5);
      if (m) samples.push(m);
    }

    for (const s of samples) {
      expect(s.length).toBeLessThanOrEqual(TRUST_LINE_MAX_CHARS);
      expect(s).not.toMatch(/\b(urgency|importance|score|priority)\b/i);
    }
  });

  test("trust lines differ from Phase 8 recovery placeholder phrasing", () => {
    const recoveryLike = "No direct action available for this event.";
    expect(activityTrustMessage("game_finished", 5)).not.toBe(recoveryLike);
    expect(STANDING_EXPANDED_TRUST_MESSAGE).not.toContain("Sign in");
  });
});
