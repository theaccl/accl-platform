import { test, expect } from "@playwright/test";

import {
  isSafeHubDocumentId,
  isValidNexusHubHref,
  NEXUS_HUB_LOGIN_HREF,
  mapTournamentRows,
} from "@/lib/nexus/nexusHubMapping";

test.describe("NEXUS hub route safety", () => {
  test("isSafeHubDocumentId accepts standard UUIDs", () => {
    expect(isSafeHubDocumentId("750e8400-e29b-41d4-a716-446655440002")).toBe(true);
    expect(isSafeHubDocumentId("750e8400-e29b-41d4-a716-446655440002\n")).toBe(true);
  });

  test("isSafeHubDocumentId rejects invalid ids", () => {
    expect(isSafeHubDocumentId("")).toBe(false);
    expect(isSafeHubDocumentId("../../../etc/passwd")).toBe(false);
    expect(isSafeHubDocumentId("undefined")).toBe(false);
    expect(isSafeHubDocumentId(null)).toBe(false);
  });

  test("dynamic routes only when ids are valid", () => {
    expect(isValidNexusHubHref("/game/750e8400-e29b-41d4-a716-446655440002")).toBe(true);
    expect(isValidNexusHubHref("/game/oops")).toBe(false);
    expect(isValidNexusHubHref("/tournaments/750e8400-e29b-41d4-a716-446655440002")).toBe(true);
    expect(isValidNexusHubHref("/tournaments/")).toBe(false);
  });

  test("tester static routes are valid hub hrefs", () => {
    expect(isValidNexusHubHref("/tester/welcome")).toBe(true);
    expect(isValidNexusHubHref("/tester/lobby-chat")).toBe(true);
    expect(isValidNexusHubHref("/tester/messages")).toBe(true);
  });

  test("login redirect format is encoded", () => {
    expect(NEXUS_HUB_LOGIN_HREF).toBe(`/login?next=${encodeURIComponent("/nexus")}`);
    expect(NEXUS_HUB_LOGIN_HREF).toMatch(/^\/login\?next=%2Fnexus$/);
  });

  test("mapTournamentRows drops invalid ids", () => {
    const rows = mapTournamentRows(
      [
        {
          id: "bad",
          name: "X",
          status: "active",
          updatedAt: "",
          href: "",
        },
        {
          id: "850e8400-e29b-41d4-a716-446655440003",
          name: "OK",
          status: "active",
          updatedAt: "2026-01-01T00:00:00.000Z",
          href: "",
        },
      ],
      12,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].href).toBe("/tournaments/850e8400-e29b-41d4-a716-446655440003");
  });
});
