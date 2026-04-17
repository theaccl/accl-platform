import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const navPath = join(process.cwd(), "components", "NavigationBar.tsx");

test.describe("NavigationBar live-game site nav lock (static)", () => {
  test("locks Back/Home from games row status active or waiting", () => {
    const src = readFileSync(navPath, "utf8");
    expect(src).toContain("usePathname");
    expect(src).toContain("GAME_PATH_RE");
    expect(src).toContain('.from("games")');
    expect(src).toContain('.select("status")');
    expect(src).toContain("lockSiteNavForLiveGame");
    expect(src).toContain("s === \"active\" || s === \"waiting\"");
    expect(src).toContain("disabled={lockSiteNavForLiveGame}");
    expect(src).toContain('data-testid="site-nav-back"');
    expect(src).toContain('data-testid="site-nav-home"');
  });
});
