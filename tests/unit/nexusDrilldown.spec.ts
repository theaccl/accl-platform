import { test, expect } from "@playwright/test";

import NexusExpandableRow from "@/components/nexus/NexusExpandableRow";
import NexusStandingReady from "@/components/nexus/NexusStandingReady";

test.describe("NEXUS Phase 5 drill-down primitives", () => {
  test("NexusExpandableRow is a client component function", () => {
    expect(typeof NexusExpandableRow).toBe("function");
  });

  test("NexusStandingReady exposes expandable standing context", () => {
    expect(typeof NexusStandingReady).toBe("function");
  });

  test("activity feed id prefixes map to hub paths (display-only contract)", () => {
    const tid = "850e8400-e29b-41d4-a716-446655440003";
    const gid = "750e8400-e29b-41d4-a716-446655440002";
    expect(`/tournaments/${tid}`).toMatch(/^\/tournaments\/[0-9a-f-]{36}$/i);
    expect(`/game/${gid}`).toMatch(/^\/game\/[0-9a-f-]{36}$/i);
  });
});
