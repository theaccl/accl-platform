import { test, expect } from "@playwright/test";

import type { NexusActivityItem } from "@/lib/nexus/getNexusData";
import { mapActivityFeedToRows } from "@/lib/nexus/nexusHubMapping";

test.describe("NEXUS activity feed mapping", () => {
  test("maps game kind to game_finished", () => {
    const rows = mapActivityFeedToRows(
      [
        {
          id: "g-1",
          kind: "game",
          message: "Winner recorded (1-0)",
          utc: "2026-01-15T12:00:00.000Z",
          game_id: "aa0e8400-e29b-41d4-a716-446655440001",
        },
      ],
      10,
    );
    expect(rows[0].type).toBe("game_finished");
    expect(rows[0].message.length).toBeGreaterThan(0);
    expect(rows[0].importance).toBeGreaterThanOrEqual(3);
  });

  test("maps tournament kind to tournament_update", () => {
    const rows = mapActivityFeedToRows(
      [
        {
          id: "t-1",
          kind: "tournament",
          message: "Spring Open is active",
          utc: "2026-01-15T12:00:00.000Z",
        },
      ],
      10,
    );
    expect(rows[0].type).toBe("tournament_update");
    expect(rows[0].importance).toBe(2);
  });

  test("maps narrative kind to player_advance with higher base importance than system", () => {
    const rows = mapActivityFeedToRows(
      [
        {
          id: "n-1",
          kind: "narrative",
          message: "Season milestone",
          utc: "2026-01-15T12:00:00.000Z",
        },
        {
          id: "x-2",
          kind: "announcement",
          message: "Notice",
          utc: "2026-01-15T12:00:00.000Z",
        },
      ],
      10,
      { nowMs: Date.parse("2026-06-01T12:00:00.000Z") },
    );
    expect(rows[0].type).toBe("player_advance");
    expect(rows[0].importance).toBeGreaterThan(rows[1]?.importance ?? 0);
  });

  test("unknown kind falls back to system", () => {
    const rows = mapActivityFeedToRows(
      [
        {
          id: "x-1",
          kind: "weird",
          message: "Something happened",
          utc: "2026-01-15T12:00:00.000Z",
        },
      ],
      10,
    );
    expect(rows[0].type).toBe("system");
  });

  test("empty feed yields empty rows", () => {
    expect(mapActivityFeedToRows([], 10)).toEqual([]);
  });

  test("dedupes duplicate ids in input", () => {
    const item: NexusActivityItem = {
      id: "dup",
      kind: "game",
      message: "m",
      utc: "2026-01-15T12:00:00.000Z",
    };
    const rows = mapActivityFeedToRows([item, item], 10);
    expect(rows.length).toBe(1);
  });
});
