import { createClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { getClientIp } from '@/lib/server/clientIp';
import { checkRateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ip = getClientIp(request);
    const limited = checkRateLimit(`attach-growth:${ip}`, 20, 60_000);
    if (!limited.allowed) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'rate_limited',
          code: 'RATE_LIMIT',
          retry_after_sec: limited.retryAfterSec,
          availability: 'unavailable',
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(limited.retryAfterSec),
          },
        }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !anon) {
      console.error('[api/public/attach-growth-profile] missing_public_supabase_env');
      return json(
        { ok: false, error: 'server_misconfigured', code: 'SUPABASE_PUBLIC', availability: 'unavailable' },
        503
      );
    }

    let admin;
    try {
      admin = createServiceRoleClient();
    } catch {
      console.error('[api/public/attach-growth-profile] service_client_unavailable');
      return json(
        { ok: false, error: 'server_misconfigured', code: 'SUPABASE_SERVICE', availability: 'unavailable' },
        503
      );
    }

    const authHeader = request.headers.get('authorization') ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(authHeader);
    if (!m) {
      return json({ ok: false, error: 'unauthorized', code: 'NO_BEARER', availability: 'unavailable' }, 401);
    }
    const token = m[1]?.trim();
    if (!token) {
      return json({ ok: false, error: 'unauthorized', code: 'EMPTY_TOKEN', availability: 'unavailable' }, 401);
    }

    const authClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData.user?.id) {
      return json({ ok: false, error: 'unauthorized', code: 'BAD_SESSION', availability: 'unavailable' }, 401);
    }
    const userId = userData.user.id;

    let body: { referral_id?: string; entry_source?: string; conversion_event?: string } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ ok: false, error: 'invalid_json', code: 'BAD_JSON', availability: 'unavailable' }, 400);
    }

    const referral_id = body.referral_id?.trim().slice(0, 120) || null;
    const entry_source = body.entry_source?.trim().slice(0, 80) || null;
    const conversion_event = body.conversion_event?.trim().slice(0, 80) || null;

    const { data: prof, error: profErr } = await admin.from('profiles').select('referral_id').eq('id', userId).maybeSingle();
    if (profErr) {
      console.error(
        '[api/public/attach-growth-profile] profile_read_failed',
        `${profErr.code ?? 'unknown'} ${(profErr.message ?? '').slice(0, 200)}`
      );
      return json(
        {
          ok: false,
          error: 'profile_read_failed',
          code: 'PROFILE_READ',
          availability: 'unavailable',
          hint: 'Profile row could not be read with service role.',
        },
        503
      );
    }

    const patch: Record<string, string> = {};
    if (referral_id && !prof?.referral_id) patch.referral_id = referral_id;
    if (entry_source) patch.entry_source = entry_source;
    if (conversion_event) patch.conversion_event = conversion_event;
    if (Object.keys(patch).length === 0) {
      return json({ ok: true, skipped: true, availability: 'available' });
    }

    const { error } = await admin.from('profiles').update(patch).eq('id', userId);

    if (error) {
      console.error(
        '[api/public/attach-growth-profile] profile_update_failed',
        `${error.code ?? 'unknown'} ${(error.message ?? '').slice(0, 200)}`
      );
      return json(
        {
          ok: false,
          error: 'profile_update_failed',
          code: 'PROFILE_UPDATE',
          availability: 'unavailable',
          hint: 'Profile could not be updated with service role.',
        },
        503
      );
    }
    return json({ ok: true, availability: 'available' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    console.error('[api/public/attach-growth-profile] unhandled', msg.slice(0, 200));
    return json(
      { ok: false, error: 'internal_error', code: 'INTERNAL', availability: 'unavailable' },
      500
    );
  }
}
