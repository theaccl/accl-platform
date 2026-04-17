import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pagePath = join(process.cwd(), "app", "friends", "page.tsx");
const clientPath = join(process.cwd(), "components", "friends", "FriendsPageClient.tsx");
const navPath = join(process.cwd(), "components", "NavigationBar.tsx");

test.describe("friends shell (static)", () => {
  test("page wires NavigationBar and client", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain("FriendsPageClient");
    expect(src).toContain("NavigationBar");
  });

  test("client has empty state, table shell, identity hook", () => {
    const src = readFileSync(clientPath, "utf8");
    expect(src).toContain("friends-empty");
    expect(src).toContain("useOpenPublicIdentityCard");
    expect(src).toContain("FriendsShellRow");
    expect(src).toContain("Presence");
  });

  test("NavigationBar lists Friends before notifications", () => {
    const src = readFileSync(navPath, "utf8");
    expect(src).toContain('href="/friends"');
    expect(src).toContain("nav-friends-link");
    expect(src).toContain("NotificationsNavLink");
  });
});
