import { getSupabaseUserFromCookies } from '@/lib/auth/getSupabaseUserFromCookies';

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return { ok: false, reason: 'MISCONFIGURED' };

  // Use the same SSR session reader as the rest of ACCL, including base64 and
  // chunked cookies. getUser validates the token with Auth before role checks.
  const user = await getSupabaseUserFromCookies();
  if (!user?.id) return { ok: false, reason: 'UNAUTHENTICATED' };

  const allowed = isModeratorUser({
    userId: user.id,
    appMetadata: (user.app_metadata ?? {}) as Record<string, unknown>,
    allowedModeratorUserIdsEnv: process.env.ACCL_MODERATOR_USER_IDS,
    enableAllowlistFallback: process.env.ACCL_ENABLE_MODERATOR_ID_FALLBACK === 'true',
  });
  if (!allowed) return { ok: false, reason: 'FORBIDDEN' };
  return { ok: true, userId: user.id };
}
