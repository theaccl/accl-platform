import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const gamePagePath = join(process.cwd(), "app", "game", "[id]", "page.tsx");

test.describe("game page spectator surface (static guards)", () => {
  test("source retains public-spectator hardening markers", () => {
    const src = readFileSync(gamePagePath, "utf8");
    expect(src).toContain("if (isPublicViewer)");
    expect(src).toContain("allowDragging: boardInputEnabled && !isPublicViewer");
    expect(src).toContain("if (isPublicViewer) return;");
    expect(src).toContain("data-spectator-readonly");
    expect(src).toContain("isPublicViewer ||");
    expect(src).toContain("isEngineProhibited");
    expect(src.match(/\{!isPublicViewer \? \(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  test("rating pipeline debug is wrapped for non-public viewers only", () => {
    const src = readFileSync(gamePagePath, "utf8");
    expect(src).toContain('data-testid="rating-update-debug"');
    const i = src.indexOf('data-testid="rating-update-debug"');
    expect(src.slice(i - 120, i)).toContain("!isPublicViewer");
  });
});
