import { test, expect } from "@playwright/test";
import { accessFromPublicHint, shouldUsePublicSpectateRpc } from "@/lib/gameRouteVisibility";

test.describe("shouldUsePublicSpectateRpc", () => {
  test("uses public RPC when URL spectate flag is set", () => {
    expect(shouldUsePublicSpectateRpc({ publicSpectateUrlFlag: true, userId: "u1" })).toBe(true);
  });

  test("uses public RPC when logged out", () => {
    expect(shouldUsePublicSpectateRpc({ publicSpectateUrlFlag: false, userId: null })).toBe(true);
    expect(shouldUsePublicSpectateRpc({ publicSpectateUrlFlag: false, userId: "" })).toBe(true);
  });

  test("uses direct games row when logged in without spectate flag", () => {
    expect(shouldUsePublicSpectateRpc({ publicSpectateUrlFlag: false, userId: "u1" })).toBe(false);
  });
});

test.describe("accessFromPublicHint", () => {
  test("maps missing and ecosystem mismatch", () => {
    expect(accessFromPublicHint("missing")).toBe("not_found");
    expect(accessFromPublicHint("ecosystem_mismatch")).toBe("ecosystem_mismatch");
  });

  test("defaults to sign_in_required", () => {
    expect(accessFromPublicHint("sign_in_required")).toBe("sign_in_required");
    expect(accessFromPublicHint(null)).toBe("sign_in_required");
  });
});
