/**
 * Dev-only: `console.warn('[phase1-debug] <label>', err)` so DevTools shows the full PostgREST error object.
 */
export function phase1DebugWarn(
  label: string,
  err: { message?: string; code?: string } | null | undefined,
): void {
  if (process.env.NODE_ENV !== "development" || !err) {
    return;
  }
  console.warn(`[phase1-debug] ${label}`, err);
}

/**
 * Dev-only tagging for Supabase failures (Phase 1 stability).
 * Never logs in production — avoids noise and leaking error detail to end users.
 */
export function logPhase1SupabaseFailure(
  resource: string,
  caller: string,
  err: { message?: string; code?: string },
  queryType: "select" | "insert" | "update" | "delete" | "rpc" = "select",
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  const msg = (err.message ?? "").trim() || "(no message)";
  const code = err.code ? ` [${err.code}]` : "";
  console.warn(`[phase1-debug] ${resource} failed in ${caller} (${queryType}): ${msg}${code}`);
}
