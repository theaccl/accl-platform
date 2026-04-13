import { test, expect } from "@playwright/test";

import { nexusInteractiveLift, nexusTransition } from "@/components/nexus/NexusHeader";

test.describe("NEXUS Phase 4 interaction tokens", () => {
  test("transition token uses ~150ms ease-out and respects reduced motion", () => {
    expect(nexusTransition).toContain("duration-150");
    expect(nexusTransition).toContain("ease-out");
    expect(nexusTransition).toMatch(/motion-reduce/);
  });

  test("interactive lift uses motion-safe scale and motion-reduce reset", () => {
    expect(nexusInteractiveLift).toContain("motion-safe:hover:scale");
    expect(nexusInteractiveLift).toContain("motion-reduce:hover:scale-100");
  });
});
