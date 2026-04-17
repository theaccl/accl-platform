import { test, expect } from "@playwright/test";

import { getFreshnessMeta } from "@/components/nexus/NexusFreshnessBadge";
import {
  STANDING_EXPANDED_TRUST_MESSAGE,
  activityTrustMessage,
  trustMessageForTopActionCard,
  trustMessageForTournamentRow,
} from "@/components/nexus/NexusTrustHint";
import { buildNexusHubActionCards } from "@/lib/nexus/nexusHubMapping";
import type { NexusLiveGame } from "@/lib/nexus/getNexusData";
import {
  buildGameHref,
  buildTournamentHref,
  hubHrefFromActivityFeedId,
  isValidHubHandoffHref,
} from "@/lib/nexus/nexusRouteHelpers";

const UUID = "750e8400-e29b-41d4-a716-446655440002";

test.describe("NEXUS freeze-pass — hub handoffs and routes", () => {
  test("built game and tournament hrefs are valid or empty", () => {
    expect(buildGameHref("x")).toBe("");
    expect(buildTournamentHref("")).toBe("");
    expect(isValidHubHandoffHref(buildGameHref(UUID))).toBe(true);
    expect(isValidHubHandoffHref(buildTournamentHref(UUID))).toBe(true);
  });

  test("activity feed id never fabricates handoff from short ids", () => {
    expect(hubHrefFromActivityFeedId("g-1")).toBeNull();
    expect(hubHrefFromActivityFeedId(`g-${UUID}`)).toBe(`/game/${UUID}`);
  });

  test("all action cards from mapping have valid hrefs", () => {
    const scenarios = [
      buildNexusHubActionCards({
        userId: null,
        liveGames: [],
        userTournamentEntryIds: [],
        hasRecentFinishedWins: false,
      }),
      buildNexusHubActionCards({
        userId: "650e8400-e29b-41d4-a716-446655440001",
        liveGames: [],
        userTournamentEntryIds: [UUID],
        hasRecentFinishedWins: true,
      }),
    ];
    for (const cards of scenarios) {
      for (const c of cards) {
        expect(c.href, c.id).toBeTruthy();
        expect(isValidHubHandoffHref(c.href)).toBe(true);
      }
    }
  });

  test("current-games href is list view when live games exist", () => {
    const uid = "650e8400-e29b-41d4-a716-446655440001";
    const gid = "750e8400-e29b-41d4-a716-446655440002";
    const live: NexusLiveGame = {
      id: gid,
      white_label: "W",
      black_label: "B",
      white_player_id: uid,
      black_player_id: null,
      white_rating: null,
      black_rating: null,
      white_tier: null,
      black_tier: null,
      time_control: "10m",
      status: "active",
      is_live: true,
      fen: "",
      move_count: 0,
      white_clock_ms: null,
      black_clock_ms: null,
      tournament_id: null,
      tournament_name: null,
      tournament_status: null,
    };
    const cards = buildNexusHubActionCards({
      userId: uid,
      liveGames: [live],
      userTournamentEntryIds: [],
      hasRecentFinishedWins: false,
    });
    const cg = cards.find((c) => c.id === "current-games");
    expect(cg?.href).toBe("/free/active");
    expect(isValidHubHandoffHref(cg?.href ?? "")).toBe(true);
  });
});

test.describe("NEXUS freeze-pass — hint hierarchy (no scores in copy)", () => {
  test("top-card trust only for known high-signal ids", () => {
    expect(trustMessageForTopActionCard("current-games")).toBeTruthy();
    expect(trustMessageForTopActionCard("continue-game")).toBeTruthy();
    expect(trustMessageForTopActionCard("free")).toBeNull();
    expect(trustMessageForTopActionCard("login")).toBeNull();
  });

  test("tournament row trust only when user context exists", () => {
    expect(trustMessageForTournamentRow(false, false)).toBeNull();
    expect(trustMessageForTournamentRow(true, false)).toBeTruthy();
  });

  test("activity trust uses type + importance only (no numeric display strings)", () => {
    const msg = activityTrustMessage("game_finished", 5);
    expect(msg).toBeTruthy();
    expect(msg).not.toMatch(/\d/);
    expect(activityTrustMessage("game_finished", 4)).toBeNull();
  });

  test("standing expanded trust is stable copy", () => {
    expect(STANDING_EXPANDED_TRUST_MESSAGE.length).toBeGreaterThan(10);
    expect(STANDING_EXPANDED_TRUST_MESSAGE).not.toMatch(/rank|score|urgency/i);
  });
});

test.describe("NEXUS freeze-pass — freshness meta", () => {
  const nowMs = Date.parse("2026-06-01T12:00:00.000Z");

  test("labels match age buckets", () => {
    expect(getFreshnessMeta("2026-06-01T11:58:30.000Z", nowMs)?.label).toBe("Live");
    expect(getFreshnessMeta("2026-06-01T11:46:00.000Z", nowMs)?.label).toBe("Recent");
    expect(getFreshnessMeta("2026-06-01T11:30:00.000Z", nowMs)?.label).toBe("Updated");
    expect(getFreshnessMeta("2026-05-25T12:00:00.000Z", nowMs)?.label).toBe("Stale");
  });

  test("missing timestamp yields null", () => {
    expect(getFreshnessMeta(undefined, nowMs)).toBeNull();
  });
});
