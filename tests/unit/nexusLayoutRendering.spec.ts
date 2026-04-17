import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { nexusModuleHeadingClass } from "@/components/nexus/NexusHeader";

const shellPath = join(process.cwd(), "components", "nexus", "NexusShell.tsx");
const hubLayoutPath = join(process.cwd(), "components", "nexus", "NexusHubLayout.tsx");
const nexusHeaderPath = join(process.cwd(), "components", "nexus", "NexusHeader.tsx");

test.describe("NEXUS Phase 3 layout modules", () => {
  test("NexusShell module exports default component (static)", () => {
    const src = readFileSync(shellPath, "utf8");
    expect(src).toMatch(/export default function NexusShell/);
  });

  test("shared module heading class is defined for consistent scan hierarchy", () => {
    expect(nexusModuleHeadingClass).toContain("uppercase");
    expect(nexusModuleHeadingClass.length).toBeGreaterThan(10);
  });

  test("Nexus hub has no primary tab strip; next actions follow the header", () => {
    const src = readFileSync(hubLayoutPath, "utf8");
    expect(src).not.toMatch(/NexusPrimaryNav/);
    expect(src).toContain("<NexusHeader");
    expect(src.indexOf("<NexusHeader")).toBeLessThan(src.indexOf("<NexusActionCards"));
  });

  test("Nexus header labels snapshot time as UTC", () => {
    const src = readFileSync(nexusHeaderPath, "utf8");
    expect(src).toContain('timeZone: "UTC"');
    expect(src).toContain(">UTC</span>");
  });
});
