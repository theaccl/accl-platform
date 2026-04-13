import { test, expect } from "@playwright/test";

import { getFreshnessMeta } from "@/components/nexus/NexusFreshnessBadge";

test.describe("NEXUS Phase 6 freshness meta", () => {
  test("thresholds: Live ≤2m, Recent ≤15m, Updated ≤1h, else Stale", () => {
    const now = Date.parse("2026-06-01T12:00:00.000Z");
    expect(getFreshnessMeta("2026-06-01T11:59:00.000Z", now)?.label).toBe("Live");
    expect(getFreshnessMeta("2026-06-01T11:50:00.000Z", now)?.label).toBe("Recent");
    expect(getFreshnessMeta("2026-06-01T11:40:00.000Z", now)?.label).toBe("Updated");
    expect(getFreshnessMeta("2026-06-01T11:30:00.000Z", now)?.label).toBe("Updated");
    expect(getFreshnessMeta("2026-06-01T10:00:00.000Z", now)?.label).toBe("Stale");
  });

  test("missing or invalid timestamp yields null", () => {
    expect(getFreshnessMeta(undefined, Date.now())).toBeNull();
    expect(getFreshnessMeta("", Date.now())).toBeNull();
    expect(getFreshnessMeta("not-a-date", Date.now())).toBeNull();
  });
});
