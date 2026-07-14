import type { SupabaseClient } from '@supabase/supabase-js';

import { sessionIdFromAccessToken } from '@/lib/auth/jwtSessionId';
import { isValidTabPresenceId } from '@/lib/presence/tabPresenceId';
import {
  PRESENCE_VISIBILITY_VALUES,
  type PresenceHeartbeatRequest,
  type PresenceVisibility,
} from '@/lib/presence/heartbeatContract';
import { resolveAuthenticatedUser } from '@/lib/requestAuth';
import { bearerToken, userScopedSupabase } from '@/lib/server/matchRequestRouteAuth';
import { checkRateLimit } from '@/lib/server/rateLimit';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Per-tab ceiling: steady 30s interval plus prompt/interaction bursts. */
export const PRESENCE_HEARTBEAT_TAB_RATE_MAX = 10;
/** Account-wide abuse ceiling across tabs/devices. */
export const PRESENCE_HEARTBEAT_ACCOUNT_RATE_MAX = 60;
export const PRESENCE_HEARTBEAT_RATE_WINDOW_MS = 60_000;

const ALLOWED_CLIENT_FIELDS = new Set(['tabPresenceId', 'visibility', 'interaction']);

export type PresenceHeartbeatRouteDeps = {
  resolveAuthenticatedUser: typeof resolveAuthenticatedUser;
  bearerToken: typeof bearerToken;
  createUserSupabase: typeof userScopedSupabase;
  checkRateLimit: typeof checkRateLimit;
  sessionIdFromAccessToken: typeof sessionIdFromAccessToken;
};

const defaultDeps: PresenceHeartbeatRouteDeps = {
  resolveAuthenticatedUser,
  bearerToken,
  createUserSupabase: userScopedSupabase,
  checkRateLimit,
  sessionIdFromAccessToken,
};

function parseVisibility(raw: unknown): PresenceVisibility | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim() as PresenceVisibility;
  return PRESENCE_VISIBILITY_VALUES.includes(v) ? v : null;
}

function findDisallowedClientField(body: Record<string, unknown>): string | null {
  for (const key of Object.keys(body)) {
    if (!ALLOWED_CLIENT_FIELDS.has(key)) return key;
  }
  return null;
}

export function validatePresenceHeartbeatBody(
  body: unknown,
):
  | { ok: true; payload: PresenceHeartbeatRequest }
  | { ok: false; error: string; status: number } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_json', status: 400 };
  }

  const record = body as Record<string, unknown>;
  const disallowed = findDisallowedClientField(record);
  if (disallowed) {
    return { ok: false, error: 'forbidden_field', status: 400 };
  }

  const tabPresenceId = record.tabPresenceId;
  if (!isValidTabPresenceId(tabPresenceId)) {
    return { ok: false, error: 'invalid_tab_presence_id', status: 400 };
  }

  const visibility = parseVisibility(record.visibility);
  if (!visibility) {
    return { ok: false, error: 'invalid_visibility', status: 400 };
  }

  if (typeof record.interaction !== 'boolean') {
    return { ok: false, error: 'invalid_interaction', status: 400 };
  }

  return {
    ok: true,
    payload: {
      tabPresenceId: tabPresenceId.trim(),
      visibility,
      interaction: record.interaction,
    },
  };
}

export async function presenceHeartbeatPost(
  request: Request,
  deps: PresenceHeartbeatRouteDeps = defaultDeps,
): Promise<Response> {
  const user = await deps.resolveAuthenticatedUser(request);
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401);

  const token = deps.bearerToken(request);
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401);

  const sessionId = deps.sessionIdFromAccessToken(token);
  if (!sessionId) return json({ ok: false, error: 'session_id_required' }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const parsed = validatePresenceHeartbeatBody(body);
  if (!parsed.ok) {
    return json({ ok: false, error: parsed.error }, parsed.status);
  }

  const tabRl = deps.checkRateLimit(
    `presence:heartbeat:tab:${sessionId}:${parsed.payload.tabPresenceId}`,
    PRESENCE_HEARTBEAT_TAB_RATE_MAX,
    PRESENCE_HEARTBEAT_RATE_WINDOW_MS,
  );
  if (!tabRl.allowed) {
    return json(
      { ok: false, error: 'rate_limited', retry_after_sec: tabRl.retryAfterSec },
      429,
    );
  }

  const accountRl = deps.checkRateLimit(
    `presence:heartbeat:account:${user.id}`,
    PRESENCE_HEARTBEAT_ACCOUNT_RATE_MAX,
    PRESENCE_HEARTBEAT_RATE_WINDOW_MS,
  );
  if (!accountRl.allowed) {
    return json(
      { ok: false, error: 'rate_limited', retry_after_sec: accountRl.retryAfterSec },
      429,
    );
  }

  let supabase: SupabaseClient;
  try {
    supabase = deps.createUserSupabase(token);
  } catch {
    return json({ ok: false, error: 'server_misconfigured' }, 503);
  }

  const { data, error } = await supabase.rpc('upsert_player_presence_heartbeat', {
    p_tab_presence_id: parsed.payload.tabPresenceId,
    p_visibility_state: parsed.payload.visibility,
    p_interaction: parsed.payload.interaction,
  });

  if (error) {
    const message = error.message ?? 'heartbeat_failed';
    if (message.includes('authentication_required') || message.includes('session_id_required')) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }
    if (message.includes('invalid_visibility_state')) {
      return json({ ok: false, error: 'invalid_visibility' }, 400);
    }
    if (message.includes('invalid_interaction')) {
      return json({ ok: false, error: 'invalid_interaction' }, 400);
    }
    if (message.includes('tab_presence_id_required')) {
      return json({ ok: false, error: 'invalid_tab_presence_id' }, 400);
    }
    return json({ ok: false, error: 'heartbeat_failed' }, 503);
  }

  const serverTime =
    typeof data === 'string' ? data : new Date().toISOString();

  return json({ ok: true, serverTime });
}
