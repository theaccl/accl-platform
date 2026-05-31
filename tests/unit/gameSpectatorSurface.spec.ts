import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const gamePagePath = join(process.cwd(), "app", "game", "[id]", "page.tsx");

test.describe("game page spectator surface (static guards)", () => {
  test("source retains public-spectator hardening markers", () => {
    const src = readFileSync(gamePagePath, "utf8");
    expect(src).toContain("if (isPublicViewer)");
    expect(src).toContain("arePiecesDraggable={boardInputEnabled && !isPublicViewer}");
    expect(src).toContain("if (isPublicViewer) return;");
    expect(src).toContain("data-spectator-readonly");
    expect(src).toContain("isPublicViewer ||");
    expect(src).toContain("isEngineProhibited");
    expect(src.match(/\{!isPublicViewer \? \(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  test("raw settlement JSON is development-only inside collapsed disclosure", () => {
    const src = readFileSync(gamePagePath, "utf8");
    expect(src).toContain('data-testid="rating-update-debug"');
    expect(src).toContain("{IS_DEV_BUILD && !isPublicViewer ? (");
    expect(src).toContain('data-testid="rating-settlement-debug-disclosure"');
    expect(src).toContain("<FinishedGameRatingSummary");
  });

  test("public viewers do not receive finished rating summary or debug", () => {
    const src = readFileSync(gamePagePath, "utf8");
    const usageIdx = src.indexOf("<FinishedGameRatingSummary");
    expect(usageIdx).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, usageIdx - 60), usageIdx)).toContain("!isPublicViewer");
  });
});
