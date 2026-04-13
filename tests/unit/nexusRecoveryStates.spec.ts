import { test, expect } from "@playwright/test";

import { buildNexusHubActionCards } from "@/lib/nexus/nexusHubMapping";
import type { NexusLiveGame } from "@/lib/nexus/getNexusData";
import {
  HUB_MSG_STANDING_OUT_OF_RANGE,
  HUB_MSG_STANDING_SIGNED_OUT,
} from "@/components/nexus/NexusRecoveryHint";
import { hubHrefFromActivityFeedId, isValidHubHandoffHref } from "@/lib/nexus/nexusRouteHelpers";

test.describe("NEXUS Phase 8 recovery guidance", () => {
  test("hub placeholder message constants match getNexusHubData MSG (signed out / out of range)", () => {
    expect(HUB_MSG_STANDING_SIGNED_OUT).toBe("Standing context not available.");
    expect(HUB_MSG_STANDING_OUT_OF_RANGE).toBe("You are currently outside the visible standings range.");
  });

  test("recovery routing targets used in UI are valid hub handoff hrefs", () => {
    for (const href of ["/tournaments", "/finished", "/free", "/profile"]) {
      expect(isValidHubHandoffHref(href), href).toBe(true);
    }
  });

  test("activity feed id yields no handoff when pattern is not g-/t-uuid", () => {
    expect(hubHrefFromActivityFeedId("g-1")).toBeNull();
    expect(hubHrefFromActivityFeedId("announcement-1")).toBeNull();
  });

  test("when activity has no handoff, valid recovery routes still exist elsewhere", () => {
    expect(isValidHubHandoffHref("/finished")).toBe(true);
    expect(isValidHubHandoffHref("/tournaments")).toBe(true);
  });

  test("action cards from mapping always expose at least one valid href (fallback paths)", () => {
    const loggedOut = buildNexusHubActionCards({
      userId: null,
      liveGames: [],
      userTournamentEntryIds: [],
      hasRecentFinishedWins: false,
    });
    expect(loggedOut.length).toBeGreaterThan(0);
    for (const c of loggedOut) {
      expect(c.href).toBeTruthy();
      expect(isValidHubHandoffHref(c.href)).toBe(true);
    }
    expect(loggedOut.some((c) => c.href === "/free")).toBe(true);
    expect(loggedOut.some((c) => c.href === "/tournaments")).toBe(true);
  });

  test("logged-in user still gets profile and browse fallbacks when no continue/tournament", () => {
    const uid = "650e8400-e29b-41d4-a716-446655440001";
    const cards = buildNexusHubActionCards({
      userId: uid,
      liveGames: [],
      userTournamentEntryIds: [],
      hasRecentFinishedWins: false,
    });
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(isValidHubHandoffHref(c.href)).toBe(true);
    }
    expect(cards.some((c) => c.id === "profile")).toBe(true);
  });

  test("continue-game card uses valid game href when live game exists", () => {
    const uid = "650e8400-e29b-41d4-a716-446655440001";
    const gid = "750e8400-e29b-41d4-a716-446655440002";
    const g: NexusLiveGame = {
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
      liveGames: [g],
      userTournamentEntryIds: [],
      hasRecentFinishedWins: false,
    });
    const cont = cards.find((c) => c.id === "continue-game");
    expect(cont?.href).toBe(`/game/${gid}`);
    expect(isValidHubHandoffHref(cont?.href ?? "")).toBe(true);
  });
});
