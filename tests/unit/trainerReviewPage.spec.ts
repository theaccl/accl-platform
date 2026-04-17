import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pagePath = join(process.cwd(), "app", "trainer", "review", "page.tsx");

test.describe("/trainer/review hub (static)", () => {
  test("loads finished games, links each row to /finished/[id] child routes", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain('.from("games")');
    expect(src).toContain('eq("status", "finished")');
    expect(src).toContain("href={`/finished/${latest.id}`}");
    expect(src).toContain("href={`/finished/${latest.id}/analyze`}");
    expect(src).toContain("href={`/finished/${latest.id}/train`}");
    expect(src).toContain("href={`/finished/${r.id}`}");
    expect(src).toContain("href={`/finished/${r.id}/analyze`}");
    expect(src).toContain("href={`/finished/${r.id}/train`}");
    expect(src).toContain('href="/trainer"');
    expect(src).toContain('data-testid="trainer-review-page"');
    expect(src).toContain('data-testid="trainer-review-open-finished"');
    expect(src).toContain("buildLoginRedirect");
    expect(src).toContain('data-testid="trainer-review-signed-out"');
  });
});
