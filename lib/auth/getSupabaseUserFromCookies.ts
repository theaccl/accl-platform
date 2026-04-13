import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

import { extractSupabaseAccessTokenFromCookieValue } from "@/lib/moderatorPageAuth";

/**
 * Server-only: resolve the current Supabase user from the session cookie (same logic as hub data).
 */
export async function getSupabaseUserFromCookies(): Promise<User | null> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.getAll().find((entry) => /^sb-.*-auth-token$/.test(entry.name));
  if (!authCookie?.value) return null;
  const token = extractSupabaseAccessTokenFromCookieValue(authCookie.value);
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return data.user;
}
