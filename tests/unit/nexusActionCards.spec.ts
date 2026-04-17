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

const emptyParams = {
  liveGames: [] as NexusLiveGame[],
  userTournamentEntryIds: [] as string[],
  hasRecentFinishedWins: false,
};

test.describe("NEXUS action cards prioritization", () => {
  test("logged-out: only login card", () => {
    const cards = buildNexusHubActionCards({
      userId: null,
      ...emptyParams,
    });
    expect(cards.map((c) => c.id)).toEqual(["login"]);
    expect(cards[0]?.urgency).toBe(90);
  });

  test("logged-in: four hub handoff cards with resume list first", () => {
    const uid = "650e8400-e29b-41d4-a716-446655440001";
    const gid = "750e8400-e29b-41d4-a716-446655440002";
    const cards = buildNexusHubActionCards({
      userId: uid,
      liveGames: [game(uid, gid)],
      userTournamentEntryIds: [],
      hasRecentFinishedWins: false,
    });
    expect(cards.map((c) => c.id)).toEqual([
      "current-games",
      "trainer-review",
      "tournaments-area",
      "nexus-free-play",
    ]);
    expect(cards[0]?.href).toBe("/free/active");
    expect(cards.find((c) => c.id === "trainer-review")?.href).toBe("/trainer/review");
    expect(cards.find((c) => c.id === "tournaments-area")?.href).toBe("/tournaments");
    expect(cards.find((c) => c.id === "nexus-free-play")?.href).toBe("/free");
  });

  test("logged-in: live games do not change resume card (always list href)", () => {
    const uid = "650e8400-e29b-41d4-a716-446655440001";
    const cards = buildNexusHubActionCards({
      userId: uid,
      liveGames: [],
      userTournamentEntryIds: ["850e8400-e29b-41d4-a716-446655440003"],
      hasRecentFinishedWins: true,
    });
    expect(cards.length).toBe(4);
    expect(cards[0]?.id).toBe("current-games");
    expect(cards[0]?.href).toBe("/free/active");
  });

  test("output has no duplicate hrefs", () => {
    const uid = "650e8400-e29b-41d4-a716-446655440001";
    const cards = buildNexusHubActionCards({
      userId: uid,
      ...emptyParams,
    });
    const hrefs = cards.map((c) => c.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
