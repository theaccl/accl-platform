import { test, expect } from "@playwright/test";

import type { NexusLiveGame } from "@/lib/nexus/getNexusData";
import { buildNexusHubActionCards } from "@/lib/nexus/nexusHubMapping";

function game(uid: string, gid: string, tid: string | null = null): NexusLiveGame {
  return {
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
    tournament_id: tid,
    tournament_name: null,
    tournament_status: null,
  };
}

test.describe("NEXUS action cards prioritization", () => {
  test("logged-out: login is first by urgency", () => {
    const cards = buildNexusHubActionCards({
      userId: null,
      liveGames: [],
      userTournamentEntryIds: [],
      hasRecentFinishedWins: false,
    });
    const sorted = [...cards].sort((a, b) => {
      if (b.urgency !== a.urgency) return b.urgency - a.urgency;
      return a.priority - b.priority;
    });
    expect(sorted[0]?.id).toBe("login");
    expect(sorted[0]?.urgency).toBe(90);
  });

  test("logged-in: continue game sorts before profile", () => {
    const uid = "650e8400-e29b-41d4-a716-446655440001";
    const gid = "750e8400-e29b-41d4-a716-446655440002";
    const cards = buildNexusHubActionCards({
      userId: uid,
      liveGames: [game(uid, gid)],
      userTournamentEntryIds: [],
      hasRecentFinishedWins: false,
    });
    const sorted = [...cards].sort((a, b) => {
      if (b.urgency !== a.urgency) return b.urgency - a.urgency;
      return a.priority - b.priority;
    });
    expect(sorted[0]?.id).toBe("continue-game");
    expect(sorted[0]?.urgency).toBe(100);
    const pi = sorted.findIndex((c) => c.id === "profile");
    const ci = sorted.findIndex((c) => c.id === "continue-game");
    expect(ci).toBeLessThan(pi);
  });

  test("tournament entry adds status card with higher priority than profile when no continue", () => {
    const uid = "650e8400-e29b-41d4-a716-446655440001";
    const tid = "850e8400-e29b-41d4-a716-446655440003";
    const cards = buildNexusHubActionCards({
      userId: uid,
      liveGames: [],
      userTournamentEntryIds: [tid],
      hasRecentFinishedWins: false,
    });
    expect(cards.some((c) => c.id === "tournament-status")).toBe(true);
    const ts = cards.find((c) => c.id === "tournament-status");
    expect(ts?.href).toBe(`/tournaments/${tid}`);
    const pr = cards.find((c) => c.id === "profile");
    expect((ts?.urgency ?? 0) > (pr?.urgency ?? 0)).toBe(true);
  });

  test("dedupes by href", () => {
    const uid = "650e8400-e29b-41d4-a716-446655440001";
    const cards = buildNexusHubActionCards({
      userId: uid,
      liveGames: [],
      userTournamentEntryIds: [],
      hasRecentFinishedWins: true,
    });
    const finished = cards.filter((c) => c.href === "/finished");
    expect(finished.length).toBe(1);
  });
});
