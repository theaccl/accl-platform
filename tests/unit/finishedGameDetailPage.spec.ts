import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pagePath = join(process.cwd(), "app", "finished", "[id]", "page.tsx");

test.describe("/finished/[id] detail page (static)", () => {
  test("loads real game + move logs and preserves finished-record wiring", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain('.from("games")');
    expect(src).toContain('.from("game_move_logs")');
    expect(src).toContain('finishedGameResultBannerText');
    expect(src).toContain('href="/trainer/review"');
    expect(src).toContain('href="/trainer"');
    expect(src).toContain('data-testid="game-finished-trainer-home-link"');
    expect(src).toContain('data-testid="finished-link-analyze"');
    expect(src).toContain('data-testid="finished-link-train"');
    expect(src).toContain("Analyze game (coming soon)");
    expect(src).toContain("Train from mistakes (coming soon)");
    expect(src).toContain('data-testid="game-finished-history-link"');
    expect(src).toContain('data-testid="finished-result-summary"');
    expect(src).toContain('data-testid="game-board"');
    expect(src).toContain('arePiecesDraggable={false}');
    expect(src).toContain('customSquareStyles={lastMoveSquareStyles}');
    expect(src).toContain('testId="game-finished-replay-playback"');
    expect(src).toContain('label={isReplayPlaying ? "Pause" : "Play"}');
    expect(src).not.toContain("Player123");
    expect(src).not.toContain("Board Replay Placeholder");
  });

  test("finished board stays read-only and is wired to lastMoveSquareStyles", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain("arePiecesDraggable={false}");
    expect(src).toContain("customSquareStyles={lastMoveSquareStyles}");
  });

  test("finished replay exposes shared Play/Pause playback", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain("isReplayPlaying");
    expect(src).toContain("toggleReplayPlayback");
    expect(src).toContain('testId="game-finished-replay-playback"');
  });

  test("finished replay keeps the active notation move visible", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain("moveListRef");
    expect(src).toContain('data-testid="finished-move-list-scroll"');
    expect(src).toContain('data-replay-step={step}');
    expect(src).toContain('activeMove?.scrollIntoView({ block: "nearest", inline: "nearest" });');
    expect(src).toContain("}, [replayStep]);");
  });
});
