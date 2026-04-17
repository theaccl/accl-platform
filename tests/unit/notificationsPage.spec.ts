import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pagePath = join(process.cwd(), "app", "notifications", "page.tsx");
const clientPath = join(process.cwd(), "components", "notifications", "NotificationsPageClient.tsx");
const buildPath = join(process.cwd(), "lib", "notifications", "buildClientNotifications.ts");
const navPath = join(process.cwd(), "components", "NavigationBar.tsx");
const navBellPath = join(process.cwd(), "components", "notifications", "NotificationsNavLink.tsx");

test.describe("notifications shell (static)", () => {
  test("page wires NavigationBar and client shell", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain("NotificationsPageClient");
    expect(src).toContain("NavigationBar");
  });

  test("client aggregates challenges, games, tournaments, system", () => {
    const src = readFileSync(clientPath, "utf8");
    expect(src).toContain("Direct challenges");
    expect(src).toContain("notifications-empty");
    expect(src).toContain("Mailbox");
    expect(src).toContain("markAllNotificationsRead");
  });

  test("builder uses existing tables and routes", () => {
    const src = readFileSync(buildPath, "utf8");
    expect(src).toContain("match_requests");
    expect(src).toContain("nexus_announcements");
    expect(src).toContain("tournament_entries");
    expect(src).toContain('/finished/');
  });

  test("NavigationBar includes notifications entry", () => {
    expect(readFileSync(navPath, "utf8")).toContain("NotificationsNavLink");
    expect(readFileSync(navBellPath, "utf8")).toContain("nav-notifications-link");
  });
});
