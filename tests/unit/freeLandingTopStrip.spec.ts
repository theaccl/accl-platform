import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test.describe("/free landing top strip (static)", () => {
  test("uses promoted action strip without primary Play computer CTA", () => {
    const pageSrc = readFileSync(join(process.cwd(), "app", "free", "page.tsx"), "utf8");
    expect(pageSrc).toContain("FreeTopActionStrip");
    expect(pageSrc).not.toContain("Play computer (unavailable)");

    const stripSrc = readFileSync(join(process.cwd(), "components", "free", "FreeTopActionStrip.tsx"), "utf8");
    expect(stripSrc).toContain('href="/free/create"');
    expect(stripSrc).toContain('href="/free/active"');
    expect(stripSrc).toContain('href="/free/challenges"');
    expect(stripSrc).toContain('data-testid="free-top-action-strip"');
    expect(stripSrc).not.toMatch(/play computer|vs computer/i);
    expect(stripSrc).not.toMatch(/href=.*computer/i);
  });
});
