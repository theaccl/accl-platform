import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

import { isModeratorUser } from '@/lib/moderatorAuth';

type GuardResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'MISCONFIGURED' };

function extractTokenFromUnknown(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const token = extractTokenFromUnknown(item);
      if (token) return token;
    }
    return null;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.access_token === 'string' && record.access_token.trim()) {
      return record.access_token.trim();
    }
    if (record.currentSession) {
      const nested = extractTokenFromUnknown(record.currentSession);
      if (nested) return nested;
    }
    for (const nestedValue of Object.values(record)) {
      const token = extractTokenFromUnknown(nestedValue);
      if (token) return token;
    }
  }
  return null;
}

export function extractSupabaseAccessTokenFromCookieValue(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return extractTokenFromUnknown(parsed);
  } catch {
    return null;
  }
}

export async function requireModeratorPageAccess(): Promise<GuardResult> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.getAll().find((entry) => /^sb-.*-auth-token$/.test(entry.name));
  if (!authCookie?.value) return { ok: false, reason: 'UNAUTHENTICATED' };
  const token = extractSupabaseAccessTokenFromCookieValue(authCookie.value);
  if (!token) return { ok: false, reason: 'UNAUTHENTICATED' };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return { ok: false, reason: 'MISCONFIGURED' };

  const client = createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await client.auth.getUser(token);
  const user = data.user;
  if (error || !user?.id) return { ok: false, reason: 'UNAUTHENTICATED' };

  const allowed = isModeratorUser({
    userId: user.id,
    appMetadata: (user.app_metadata ?? {}) as Record<string, unknown>,
    allowedModeratorUserIdsEnv: process.env.ACCL_MODERATOR_USER_IDS,
    enableAllowlistFallback: process.env.ACCL_ENABLE_MODERATOR_ID_FALLBACK === 'true',
  });
  if (!allowed) return { ok: false, reason: 'FORBIDDEN' };
  return { ok: true, userId: user.id };
}
