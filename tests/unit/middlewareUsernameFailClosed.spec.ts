import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathnameRequiresUsernameClaim } from "../../lib/middlewareUsernameGate";
import {
  fetchProfileUsernameGateStatus,
  getUsernameGateConfigState,
} from "../../lib/middlewareUsernameLookup";

test.describe("middleware username gate (fail-closed)", () => {
  test("middleware source must not bypass gate when lookup is unverified", () => {
    const mw = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");
    expect(mw).toContain("fetchProfileUsernameGateStatus");
    expect(mw).toContain('lookup.status === "unverified"');
    expect(mw).toContain("/account/configuration-required");
    expect(mw).toContain('"/tester/:path*"');
    expect(mw).not.toMatch(/profileNeedsUsernameClaim[\s\S]*return false[\s\S]*SUPABASE_SERVICE_ROLE_KEY/i);
  });

  test("lookup module logs fail-closed via logUsernameGateFailClosed", () => {
    const src = readFileSync(join(process.cwd(), "lib", "middlewareUsernameLookup.ts"), "utf8");
    expect(src).toContain("logUsernameGateFailClosed");
    expect(src).toContain("accl_username_gate_fail_closed");
  });

  test("pathname gate excludes public and account safety routes", () => {
    expect(pathnameRequiresUsernameClaim("/")).toBe(false);
    expect(pathnameRequiresUsernameClaim("/login")).toBe(false);
    expect(pathnameRequiresUsernameClaim("/onboarding/username")).toBe(false);
    expect(pathnameRequiresUsernameClaim("/share/x")).toBe(false);
    expect(pathnameRequiresUsernameClaim("/account/configuration-required")).toBe(false);
    expect(pathnameRequiresUsernameClaim("/profile/550e8400-e29b-41d4-a716-446655440000")).toBe(false);
    expect(pathnameRequiresUsernameClaim("/modes")).toBe(true);
    expect(pathnameRequiresUsernameClaim("/tester/welcome")).toBe(true);
  });
});

test.describe.configure({ mode: "serial" });

test.describe("getUsernameGateConfigState (env)", () => {
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedSr = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const savedE2e = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;

  test.afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = savedSr;
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = savedE2e;
  });

  test("missing service role (both) yields missing_service_role", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
    expect(getUsernameGateConfigState()).toBe("missing_service_role");
  });

  test("missing public url yields missing_supabase_url", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    expect(getUsernameGateConfigState()).toBe("missing_supabase_url");
  });

  test("fetchProfileUsernameGateStatus returns unverified when service role missing", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
    const r = await fetchProfileUsernameGateStatus("00000000-0000-0000-0000-000000000001");
    expect(r.status).toBe("unverified");
    if (r.status === "unverified") expect(r.reason).toBe("missing_service_role");
  });
});
