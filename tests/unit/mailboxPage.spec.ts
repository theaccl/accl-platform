import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const clientPath = join(process.cwd(), "app", "tester", "messages", "TesterDmClient.tsx");
const layoutPath = join(process.cwd(), "app", "tester", "messages", "layout.tsx");

test.describe("/tester/messages mailbox (static)", () => {
  test("client keeps DM transport routes and mailbox IA", () => {
    const src = readFileSync(clientPath, "utf8");
    expect(src).toContain("Mailbox");
    expect(src).toContain("data-testid=\"mailbox-title\"");
    expect(src).toContain("/api/chat/dm/threads");
    expect(src).toContain("channel=dm");
    expect(src).toContain("/api/chat/send");
    expect(src).toContain("searchParams.get(\"peer\")");
    expect(src).toContain("resolve_profile_for_challenge_lookup");
    expect(src).toContain("data-testid=\"tester-dm-thread\"");
  });

  test("layout sets page title metadata", () => {
    const src = readFileSync(layoutPath, "utf8");
    expect(src).toContain("Mailbox");
    expect(src).toContain("metadata");
  });
});
