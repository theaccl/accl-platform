import { test, expect } from "@playwright/test";

import type { NexusActivityItem } from "@/lib/nexus/getNexusData";
import type { NexusLiveGame } from "@/lib/nexus/getNexusData";
import {
  buildNexusHubActionCards,
  isValidNexusHubHref,
  mapActivityFeedToRows,
  mapTournamentRows,
  mapWinnersToRecentRows,
  NEXUS_HUB_LOGIN_HREF,
  shouldHighlightResultTier,
  stageLabelFromStatus,
} from "@/lib/nexus/nexusHubMapping";

const emptyActionParams = {
  userTournamentEntryIds: [] as string[],
  hasRecentFinishedWins: false,
};

function winner(overrides: Partial<{ id: string; player_label: string; event_name: string; utc: string; tier: string }>) {
  return {
    id: overrides.id ?? "550e8400-e29b-41d4-a716-446655440000",
    player_label: overrides.player_label ?? "player1",
    tier: overrides.tier ?? "Free",
    amount_won: 0,
    event_name: overrides.event_name ?? "Event",
    utc: overrides.utc ?? "2026-01-01T00:00:00.000Z",
    winner_user_id: null,
    payout_category: "free_finish" as const,
  };
}

test.describe("NEXUS hub mapping", () => {
  test("mapWinnersToRecentRows caps at 8", () => {
    const rows = Array.from({ length: 12 }, () => winner({ id: "550e8400-e29b-41d4-a716-446655440099" }));
    const mapped = mapWinnersToRecentRows(rows as never[], 8);
    expect(mapped.length).toBe(8);
  });

  test("mapWinnersToRecentRows produces bounded rows with safe defaults", () => {
    const mapped = mapWinnersToRecentRows([winner({})] as never[], 8);
    expect(mapped[0].result).toBe("Win recorded");
    expect(mapped[0].playerLabel.length).toBeGreaterThan(0);
    expect(mapped[0].relativeLabel).toBeTruthy();
  });

  test("tier highlight for Elite / A only", () => {
    const elite = mapWinnersToRecentRows([winner({ tier: "Elite" })] as never[], 8);
    expect(elite[0].tierHighlight).toBe(true);
    const a = mapWinnersToRecentRows([winner({ tier: "A" })] as never[], 8);
    expect(a[0].tierHighlight).toBe(true);
    expect(shouldHighlightResultTier("B")).toBe(false);
  });

  test("mapTournamentRows adds stage from status when omitted", () => {
    const rows = mapTournamentRows(
      [
        {
          id: "850e8400-e29b-41d4-a716-446655440003",
          name: "Open",
          status: "in_progress",
          updatedAt: "2026-01-01T00:00:00.000Z",
          href: "",
        },
      ],
      12,
    );
    expect(rows[0].stageLabel).toBe(stageLabelFromStatus("in_progress"));
  });

  test("mapActivityFeedToRows normalizes and bounds to 10", () => {
    const feed: NexusActivityItem[] = Array.from({ length: 15 }, (_, i) => ({
      id: `g-${i}`,
      kind: "game",
      message: `update ${i}`,
      utc: "2026-01-01T00:00:00.000Z",
    }));
    const rows = mapActivityFeedToRows(feed, 10);
    expect(rows.length).toBe(10);
    expect(rows[0].type).toBe("game_finished");
    expect(rows[0].timestamp).toBeTruthy();
    expect(typeof rows[0].importance).toBe("number");
  });

  test("action cards contain only valid hrefs", () => {
    const cards = buildNexusHubActionCards({ userId: null, liveGames: [], ...emptyActionParams });
    for (const c of cards) {
      expect(isValidNexusHubHref(c.href)).toBe(true);
      expect(c.href).not.toMatch(/undefined/);
      expect(typeof c.priority).toBe("number");
      expect(typeof c.urgency).toBe("number");
    }
  });

  test("login card uses encoded next=/nexus", () => {
    const cards = buildNexusHubActionCards({ userId: null, liveGames: [], ...emptyActionParams });
    const login = cards.find((c) => c.id === "login");
    expect(login).toBeTruthy();
    expect(login?.href).toBe(NEXUS_HUB_LOGIN_HREF);
    expect(login?.href).toContain(encodeURIComponent("/nexus"));
  });

  test("current-games card still appears when a live row has a non-UUID id (list view, not deep link)", () => {
    const uid = "650e8400-e29b-41d4-a716-446655440001";
    const badGame: NexusLiveGame = {
      id: "not-a-uuid",
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
      liveGames: [badGame],
      userTournamentEntryIds: [],
      hasRecentFinishedWins: false,
    });
    const cg = cards.find((c) => c.id === "current-games");
    expect(cg?.href).toBe("/free/active");
  });

  test("current-games href is list view even when live game id is valid UUID", () => {
    const uid = "650e8400-e29b-41d4-a716-446655440001";
    const gid = "750e8400-e29b-41d4-a716-446655440002";
    const goodGame: NexusLiveGame = {
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
      liveGames: [goodGame],
      userTournamentEntryIds: [],
      hasRecentFinishedWins: false,
    });
    const cg = cards.find((c) => c.id === "current-games");
    expect(cg?.href).toBe("/free/active");
  });

  test("placeholder keys are documented when using empty winner list", () => {
    const mapped = mapWinnersToRecentRows([], 8);
    expect(mapped.length).toBe(0);
  });
});
