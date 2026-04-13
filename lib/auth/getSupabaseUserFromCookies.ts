import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-only: current user from the same cookie session as middleware + browser client.
 */
export async function getSupabaseUserFromCookies(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.id) return null;
  return user;
}
