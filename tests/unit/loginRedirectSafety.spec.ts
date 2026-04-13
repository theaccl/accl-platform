import { test, expect } from "@playwright/test";

import {
  buildGameHref,
  buildTournamentHref,
  getSafePostLoginRedirect,
  isValidGameRoute,
  isValidTournamentRoute,
} from "@/lib/nexus/nexusRouteHelpers";

const LOWER = "750e8400-e29b-41d4-a716-446655440002";
const UPPER = "750E8400-E29B-41D4-A716-446655440002";

test.describe("getSafePostLoginRedirect", () => {
  test("empty or missing next falls back to /modes", () => {
    expect(getSafePostLoginRedirect(null)).toBe("/modes");
    expect(getSafePostLoginRedirect(undefined)).toBe("/modes");
    expect(getSafePostLoginRedirect("")).toBe("/modes");
    expect(getSafePostLoginRedirect("   ")).toBe("/modes");
  });

  test("internal paths pass through", () => {
    expect(getSafePostLoginRedirect("/nexus")).toBe("/nexus");
    expect(getSafePostLoginRedirect("/game/" + LOWER)).toBe("/game/" + LOWER);
    expect(getSafePostLoginRedirect("/profile")).toBe("/profile");
  });

  test("decoded next from URLSearchParams works (e.g. /login?next=%2Fnexus)", () => {
    const decoded = new URLSearchParams("next=%2Fnexus").get("next");
    expect(decoded).toBe("/nexus");
    expect(getSafePostLoginRedirect(decoded)).toBe("/nexus");
    expect(getSafePostLoginRedirect(new URLSearchParams("next=/nexus").get("next"))).toBe("/nexus");
  });

  test("rejects open redirects and protocol tricks", () => {
    expect(getSafePostLoginRedirect("//evil.com")).toBe("/modes");
    expect(getSafePostLoginRedirect("//evil.com/path")).toBe("/modes");
    expect(getSafePostLoginRedirect("https://evil.com")).toBe("/modes");
    expect(getSafePostLoginRedirect("http://evil.com")).toBe("/modes");
    expect(getSafePostLoginRedirect("javascript:alert(1)")).toBe("/modes");
  });

  test("rejects backslashes and traversal", () => {
    expect(getSafePostLoginRedirect("/foo\\bar")).toBe("/modes");
    expect(getSafePostLoginRedirect("\\\\evil\\path")).toBe("/modes");
    expect(getSafePostLoginRedirect("/safe/../admin")).toBe("/modes");
  });

  test("avoids redirect loop to login", () => {
    expect(getSafePostLoginRedirect("/login")).toBe("/modes");
    expect(getSafePostLoginRedirect("/login?next=/nexus")).toBe("/modes");
  });
});

test.describe("UUID validation (via mapping /i)", () => {
  test("lowercase and uppercase UUIDs pass", () => {
    expect(isValidGameRoute(LOWER)).toBe(true);
    expect(isValidGameRoute(UPPER)).toBe(true);
    expect(isValidTournamentRoute(LOWER)).toBe(true);
    expect(isValidTournamentRoute(UPPER)).toBe(true);
  });

  test("buildGameHref and buildTournamentHref accept mixed case", () => {
    expect(buildGameHref(UPPER)).toBe(`/game/${UPPER}`);
    expect(buildTournamentHref(LOWER)).toBe(`/tournaments/${LOWER}`);
  });

  test("partial and empty ids fail", () => {
    expect(isValidGameRoute("750e8400-e29b-41d4-a716-44665544000")).toBe(false);
    expect(isValidGameRoute("")).toBe(false);
    expect(buildGameHref("bad")).toBe("");
    expect(buildTournamentHref("")).toBe("");
  });
});
