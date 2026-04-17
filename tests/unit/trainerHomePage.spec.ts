import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pagePath = join(process.cwd(), "app", "trainer", "page.tsx");

test.describe("/trainer home (static)", () => {
  test("positions review hub and deep-links latest finished game when present", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain('href="/trainer/review"');
    expect(src).toContain("href={`/finished/${latestFinishedId}`}");
    expect(src).toContain('data-testid="trainer-hub-review-cta"');
    expect(src).toContain('data-testid="trainer-hub-latest-finished"');
    expect(src).toContain('data-testid="trainer-home-page"');
  });
});
