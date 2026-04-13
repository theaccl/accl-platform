import { test, expect } from "@playwright/test";

import type { NexusActivityItem } from "@/lib/nexus/getNexusData";
import type { NexusLiveGame } from "@/lib/nexus/getNexusData";
import type { NexusTournamentRow } from "@/lib/nexus/types";
import {
  buildNexusHubActionCards,
  mapActivityFeedToRows,
  mapWinnersToRecentRows,
  scoreAndSortTournamentRows,
} from "@/lib/nexus/nexusHubMapping";

const TID = "850e8400-e29b-41d4-a716-446655440003";
const UID = "650e8400-e29b-41d4-a716-446655440001";
const GID = "750e8400-e29b-41d4-a716-446655440002";

function winner(overrides: Partial<{ id: string; player_label: string; event_name: string; utc: string; tier: string }>) {
  return {
    id: overrides.id ?? "550e8400-e29b-41d4-a716-446655440000",
    player_label: overrides.player_label ?? "p",
    tier: overrides.tier ?? "Free",
    amount_won: 0,
    event_name: overrides.event_name ?? "Event",
    utc: overrides.utc ?? "2026-01-01T00:00:00.000Z",
    winner_user_id: null,
    payout_category: "free_finish" as const,
  };
}

function liveGameWithTournament(tournamentId: string | null): NexusLiveGame {
  return {
    id: GID,
    white_label: "W",
    black_label: "B",
    white_player_id: UID,
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
    tournament_id: tournamentId,
    tournament_name: null,
    tournament_status: null,
  };
}

test.describe("NEXUS Phase 2.5 signal refinement", () => {
  test("activity sorts by importance desc then timestamp desc", () => {
    const feed: NexusActivityItem[] = [
      {
        id: "sys-1",
        kind: "announcement",
        message: "Low signal",
        utc: "2026-01-20T12:00:00.000Z",
      },
      {
        id: "g-1",
        kind: "game",
        message: "Winner recorded (1-0)",
        utc: "2026-01-10T12:00:00.000Z",
        game_id: GID,
      },
      {
        id: `t-${TID}`,
        kind: "tournament",
        message: "Spring Open is active",
        utc: "2026-01-15T12:00:00.000Z",
      },
    ];
    const rows = mapActivityFeedToRows(feed, 10, { nowMs: Date.parse("2026-01-25T12:00:00.000Z") });
    expect(rows[0].type).toBe("game_finished");
    expect(rows[0].importance).toBeGreaterThanOrEqual(rows[1]?.importance ?? 0);
    expect(rows.length).toBe(3);
  });

  test("activity removes duplicate normalized messages", () => {
    const feed: NexusActivityItem[] = [
      {
        id: "t-a",
        kind: "tournament",
        message: "Identical tournament line",
        utc: "2026-01-20T12:00:00.000Z",
      },
      {
        id: "t-b",
        kind: "tournament",
        message: "Identical tournament line",
        utc: "2026-01-21T12:00:00.000Z",
      },
    ];
    const rows = mapActivityFeedToRows(feed, 10);
    expect(rows.length).toBe(1);
  });

  test("activity caps at 10 items", () => {
    const feed: NexusActivityItem[] = Array.from({ length: 15 }, (_, i) => ({
      id: `n-${i}`,
      kind: "announcement",
      message: `line ${i}`,
      utc: `2026-01-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`,
    }));
    expect(mapActivityFeedToRows(feed, 10).length).toBe(10);
  });

  test("activity boosts importance when tournament id matches participation set", () => {
    const feed: NexusActivityItem[] = [
      {
        id: `t-${TID}`,
        kind: "tournament",
        message: "Mine is active",
        utc: "2026-01-15T12:00:00.000Z",
      },
      {
        id: "t-950e8400-e29b-41d4-a716-446655440099",
        kind: "tournament",
        message: "Other is active",
        utc: "2026-01-15T12:00:00.000Z",
      },
    ];
    const rows = mapActivityFeedToRows(feed, 10, {
      userParticipatingTournamentIds: new Set([TID]),
      nowMs: Date.parse("2026-06-01T12:00:00.000Z"),
    });
    expect(rows[0].id).toBe(`t-${TID}`);
    expect(rows[0].importance).toBeGreaterThan(rows[1]?.importance ?? 0);
  });

  test("activity boosts when finished game ties to participating tournament via liveGames", () => {
    const feed: NexusActivityItem[] = [
      {
        id: "g-later",
        kind: "game",
        message: "Winner recorded (1-0)",
        utc: "2026-01-20T12:00:00.000Z",
        game_id: GID,
      },
      {
        id: "g-earlier",
        kind: "game",
        message: "Winner recorded (0-1)",
        utc: "2026-01-22T12:00:00.000Z",
        game_id: "650e8400-e29b-41d4-a716-446655440099",
      },
    ];
    const rows = mapActivityFeedToRows(feed, 10, {
      userParticipatingTournamentIds: new Set([TID]),
      liveGames: [liveGameWithTournament(TID)],
      userId: UID,
      nowMs: Date.parse("2026-06-01T12:00:00.000Z"),
    });
    expect(rows[0].id).toBe("g-later");
    expect(rows[0].importance).toBeGreaterThan(rows.find((r) => r.id === "g-earlier")?.importance ?? 0);
  });

  test("action cards sort by urgency desc then priority asc", () => {
    const cards = buildNexusHubActionCards({
      userId: UID,
      liveGames: [liveGameWithTournament(null)],
      userTournamentEntryIds: [TID],
      hasRecentFinishedWins: true,
    });
    for (let i = 0; i < cards.length - 1; i++) {
      const a = cards[i]!;
      const b = cards[i + 1]!;
      if (b.urgency === a.urgency) {
        expect(a.priority).toBeLessThanOrEqual(b.priority);
      } else {
        expect(a.urgency).toBeGreaterThan(b.urgency);
      }
    }
  });

  test("tournament relevance sorts user-active rows first", () => {
    const rows: NexusTournamentRow[] = [
      {
        id: "950e8400-e29b-41d4-a716-446655440099",
        name: "Other",
        status: "active",
        updatedAt: "2026-01-20T12:00:00.000Z",
        href: "/tournaments/950e8400-e29b-41d4-a716-446655440099",
        userParticipating: false,
        userHasActiveGame: false,
      },
      {
        id: TID,
        name: "Mine",
        status: "active",
        updatedAt: "2026-01-01T12:00:00.000Z",
        href: `/tournaments/${TID}`,
        userParticipating: true,
        userHasActiveGame: false,
      },
    ];
    const sorted = scoreAndSortTournamentRows(rows, 12);
    expect(sorted[0].id).toBe(TID);
    expect(sorted[0].relevance).toBeGreaterThanOrEqual(sorted[1]?.relevance ?? 0);
  });

  test("tournament relevance prefers active game over participation", () => {
    const rows: NexusTournamentRow[] = [
      {
        id: "950e8400-e29b-41d4-a716-446655440099",
        name: "Participate only",
        status: "active",
        updatedAt: "2026-01-20T12:00:00.000Z",
        href: "/tournaments/950e8400-e29b-41d4-a716-446655440099",
        userParticipating: true,
        userHasActiveGame: false,
      },
      {
        id: TID,
        name: "Active game",
        status: "active",
        updatedAt: "2026-01-01T12:00:00.000Z",
        href: `/tournaments/${TID}`,
        userParticipating: true,
        userHasActiveGame: true,
      },
    ];
    const sorted = scoreAndSortTournamentRows(rows, 12);
    expect(sorted[0].userHasActiveGame).toBe(true);
    expect(sorted[0].relevance).toBe(100);
  });

  test("recent results prioritize tier highlight then recency", () => {
    const mapped = mapWinnersToRecentRows(
      [
        winner({ id: "1", tier: "Free", utc: "2026-01-15T12:00:00.000Z", player_label: "a" }),
        winner({ id: "2", tier: "Elite", utc: "2026-01-01T12:00:00.000Z", player_label: "b" }),
      ] as never[],
      8,
      Date.parse("2026-02-01T12:00:00.000Z"),
    );
    expect(mapped[0].tierHighlight).toBe(true);
    expect(mapped[0].playerLabel).toBe("b");
  });
});
