import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pagePath = join(process.cwd(), "app", "finished", "[id]", "page.tsx");

test.describe("/finished/[id] detail page (static)", () => {
  test("loads real game + move logs and preserves hub / child-route wiring", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain('.from("games")');
    expect(src).toContain('.from("game_move_logs")');
    expect(src).toContain('finishedGameResultBannerText');
    expect(src).toContain('href="/trainer/review"');
    expect(src).toContain('href="/trainer"');
    expect(src).toContain('data-testid="game-finished-trainer-home-link"');
    expect(src).toContain("href={`/finished/${game.id}/analyze`}");
    expect(src).toContain("href={`/finished/${game.id}/train`}");
    expect(src).toContain('data-testid="game-finished-history-link"');
    expect(src).toContain('data-testid="finished-result-summary"');
    expect(src).toContain('data-testid="game-board"');
    expect(src).toContain('arePiecesDraggable={false}');
    expect(src).not.toContain("Player123");
    expect(src).not.toContain("Board Replay Placeholder");
  });
});
