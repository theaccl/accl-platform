import { test, expect } from "@playwright/test";

import { buildNexusHubActionCards } from "@/lib/nexus/nexusHubMapping";
import type { NexusLiveGame } from "@/lib/nexus/getNexusData";
import {
  buildGameHref,
  buildLoginRedirect,
  buildTournamentHref,
  hubHrefFromActivityFeedId,
  isValidGameRoute,
  isValidHubHandoffHref,
  isValidTournamentRoute,
} from "@/lib/nexus/nexusRouteHelpers";
import { NEXUS_HUB_LOGIN_HREF } from "@/lib/nexus/nexusHubMapping";

const UUID = "750e8400-e29b-41d4-a716-446655440002";
const UUID2 = "850e8400-e29b-41d4-a716-446655440003";

test.describe("NEXUS route helpers (Phase 7 handoff)", () => {
  test("valid UUIDs pass route validators", () => {
    expect(isValidGameRoute(UUID)).toBe(true);
    expect(isValidTournamentRoute(UUID)).toBe(true);
  });

  test("invalid ids fail validators", () => {
    expect(isValidGameRoute("")).toBe(false);
    expect(isValidGameRoute(undefined)).toBe(false);
    expect(isValidGameRoute("../../../x")).toBe(false);
    expect(isValidTournamentRoute("oops")).toBe(false);
  });

  test("buildGameHref / buildTournamentHref produce stable paths or empty string", () => {
    expect(buildGameHref(UUID)).toBe(`/game/${UUID}`);
    expect(buildTournamentHref(UUID2)).toBe(`/tournaments/${UUID2}`);
    expect(buildGameHref("bad")).toBe("");
    expect(buildTournamentHref("")).toBe("");
  });

  test("hubHrefFromActivityFeedId maps g-/t- prefixed UUIDs only", () => {
    expect(hubHrefFromActivityFeedId(`g-${UUID}`)).toBe(`/game/${UUID}`);
    expect(hubHrefFromActivityFeedId(`t-${UUID2}`)).toBe(`/tournaments/${UUID2}`);
    expect(hubHrefFromActivityFeedId("g-1")).toBeNull();
    expect(hubHrefFromActivityFeedId("t-short")).toBeNull();
    expect(hubHrefFromActivityFeedId("narrative-1")).toBeNull();
  });

  test("buildLoginRedirect encodes next and matches hub login constant for /nexus", () => {
    expect(buildLoginRedirect("/nexus")).toBe(NEXUS_HUB_LOGIN_HREF);
    expect(buildLoginRedirect("")).toBe(NEXUS_HUB_LOGIN_HREF);
    expect(buildLoginRedirect("nexus")).toBe(NEXUS_HUB_LOGIN_HREF);
    expect(buildLoginRedirect("/path with spaces")).toBe(`/login?next=${encodeURIComponent("/path with spaces")}`);
  });

  test("isValidHubHandoffHref rejects malformed dynamic segments", () => {
    expect(isValidHubHandoffHref(`/game/${UUID}`)).toBe(true);
    expect(isValidHubHandoffHref("/game/oops")).toBe(false);
    expect(isValidHubHandoffHref("/tournaments/")).toBe(false);
  });

  test("hub action cards from mapping all have safe handoff hrefs", () => {
    const uid = "650e8400-e29b-41d4-a716-446655440001";
    const gid = "750e8400-e29b-41d4-a716-446655440002";
    const tid = "850e8400-e29b-41d4-a716-446655440003";

    const game = (g: NexusLiveGame): NexusLiveGame => g;

    const scenarios = [
      buildNexusHubActionCards({
        userId: null,
        liveGames: [],
        userTournamentEntryIds: [],
        hasRecentFinishedWins: false,
      }),
      buildNexusHubActionCards({
        userId: uid,
        liveGames: [
          game({
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
          }),
        ],
        userTournamentEntryIds: [tid],
        hasRecentFinishedWins: true,
      }),
    ];

    for (const cards of scenarios) {
      for (const c of cards) {
        expect(c.href, `card ${c.id}`).toBeTruthy();
        expect(String(c.href)).not.toMatch(/undefined|null/i);
        expect(isValidHubHandoffHref(c.href)).toBe(true);
      }
    }
  });

  /**
   * NexusLinkWrapper is a thin branch (Link vs span); SSR tests hit Next.js Link
   * limitations in Node. Handoff safety is covered by helper tests + hub href validation above.
   */
});
