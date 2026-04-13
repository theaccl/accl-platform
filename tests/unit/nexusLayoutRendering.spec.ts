import { test, expect } from "@playwright/test";

import NexusShell from "@/components/nexus/NexusShell";
import { nexusModuleHeadingClass } from "@/components/nexus/NexusHeader";

test.describe("NEXUS Phase 3 layout modules", () => {
  test("NexusShell is a valid React component function", () => {
    expect(typeof NexusShell).toBe("function");
  });

  test("shared module heading class is defined for consistent scan hierarchy", () => {
    expect(nexusModuleHeadingClass).toContain("uppercase");
    expect(nexusModuleHeadingClass.length).toBeGreaterThan(10);
  });
});
