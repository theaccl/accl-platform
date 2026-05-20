import { getSupabaseUserFromCookies } from '@/lib/auth/getSupabaseUserFromCookies';
import { auditApiLog, shortId } from '@/lib/server/prodLog';
import { guardRequest } from '@/lib/server/requestGuard';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

/** Participant presence: explicit check-in + page heartbeat (pre-launch only). */
export async function POST(
  request: Request,
  context: { params: { id: string } },
): Promise<Response> {
  const guard = guardRequest(request, 'tournaments');
  if (!guard.ok) return guard.response;

  try {
    const tournamentId = String(context.params?.id ?? '').trim();
    if (!UUID_RE.test(tournamentId)) {
      return json({ ok: false, error: 'Invalid tournament id.' }, 400);
    }

    const sessionUser = await getSupabaseUserFromCookies();
    if (!sessionUser?.id) {
      return json({ ok: false, error: 'Sign in required.' }, 401);
    }

    let body: { explicit?: boolean } = {};
    try {
      body = (await request.json()) as { explicit?: boolean };
    } catch {
      body = {};
    }

    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();

    const { data: entry, error: eErr } = await supabase
      .from('tournament_entries')
      .select('user_id, tournament_id')
      .eq('tournament_id', tournamentId)
      .eq('user_id', sessionUser.id)
      .maybeSingle();
    if (eErr) return json({ ok: false, error: eErr.message }, 502);
    if (!entry) return json({ ok: false, error: 'Not registered for this tournament.' }, 403);

    const patch: Record<string, string> = { last_seen_at: now };
    if (body.explicit === true) {
      patch.checked_in_at = now;
    }

    const { error: upErr } = await supabase
      .from('tournament_entries')
      .update(patch)
      .eq('tournament_id', tournamentId)
      .eq('user_id', sessionUser.id);
    if (upErr) return json({ ok: false, error: upErr.message }, 502);

    auditApiLog('tournament_check_in', {
      tournament_id: shortId(tournamentId),
      user: shortId(sessionUser.id),
      explicit: body.explicit === true,
    });

    return json({ ok: true, checked_in_at: patch.checked_in_at ?? null, last_seen_at: now });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Check-in failed';
    return json({ ok: false, error: message }, 503);
  } finally {
    guard.release();
  }
}
