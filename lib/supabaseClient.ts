import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** One client per JS realm — avoids duplicate GoTrue instances under HMR. */
const globalForSupabase = globalThis as typeof globalThis & {
  __accl_supabase__?: SupabaseClient;
};

if (!globalForSupabase.__accl_supabase__) {
  globalForSupabase.__accl_supabase__ = createBrowserClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = globalForSupabase.__accl_supabase__;

function isInvalidStoredSessionError(err: { message?: string } | null | undefined): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("refresh token") ||
    m.includes("invalid jwt") ||
    m.includes("jwt expired")
  );
}

/** Drop broken persisted session so the client stops retrying refresh. */
if (typeof window !== "undefined") {
  void supabase.auth.getUser().then(async ({ error }) => {
    if (error && isInvalidStoredSessionError(error)) {
      await supabase.auth.signOut({ scope: "local" });
    }
  });
}
