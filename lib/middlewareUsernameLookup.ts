import { createClient } from "@supabase/supabase-js";

/** For tests and diagnostics — does not perform network I/O. */
export function getUsernameGateConfigState(): "ready" | "missing_supabase_url" | "missing_service_role" {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url) return "missing_supabase_url";
  if (!key) return "missing_service_role";
  return "ready";
}

export type ProfileUsernameLookup =
  | { status: "ok"; needsUsernameClaim: boolean }
  | {
      status: "unverified";
      reason: "missing_supabase_url" | "missing_service_role" | "db_error";
      detail?: string;
    };

/**
 * Server-side profile username check for middleware (service role).
 * Returns `unverified` when configuration is missing or the DB lookup fails — callers must fail closed.
 */
export async function fetchProfileUsernameGateStatus(userId: string): Promise<ProfileUsernameLookup> {
  const cfg = getUsernameGateConfigState();
  if (cfg === "missing_supabase_url") {
    return { status: "unverified", reason: "missing_supabase_url" };
  }
  if (cfg === "missing_service_role") {
    return { status: "unverified", reason: "missing_service_role" };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const key =
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.E2E_SUPABASE_SERVICE_ROLE_KEY)!.trim();

  const svc = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await svc.from("profiles").select("username").eq("id", userId).maybeSingle();

  if (error) {
    return { status: "unverified", reason: "db_error", detail: error.message };
  }

  const u = (data as { username?: string | null } | null)?.username;
  const needsUsernameClaim = !String(u ?? "").trim();
  return { status: "ok", needsUsernameClaim };
}

export function logUsernameGateFailClosed(reason: ProfileUsernameLookup & { status: "unverified" }): void {
  const payload = {
    event: "accl_username_gate_fail_closed",
    reason: reason.reason,
    detail: reason.detail ?? null,
  };
  console.error(`[accl] ${JSON.stringify(payload)}`);
}
