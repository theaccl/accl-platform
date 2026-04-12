import { createClient } from '@supabase/supabase-js';
import { getClientIp } from '@/lib/server/clientIp';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { tooManyRequests } from '@/lib/server/httpJson';

export const runtime = 'nodejs';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function resolveUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) return null;
  const token = m[1]?.trim();
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error) return null;
  return data.user?.id ?? null;
}

export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const limited = checkRateLimit(`growth-event:${ip}`, 60, 60_000);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSec);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return json({ ok: false, error: 'server_misconfigured' }, 500);

  let body: { events?: unknown[] } = {};
  try {
    body = (await request.json()) as { events?: unknown[] };
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }
  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length === 0) return json({ ok: true, inserted: 0 });
  if (events.length > 32) return json({ ok: false, error: 'too_many' }, 400);

  const userId = await resolveUserId(request);

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const rows = events.slice(0, 32).map((e) => {
    const o = e as Record<string, unknown>;
    return {
      event_type: String(o.event_type ?? 'unknown').slice(0, 80),
      entry_source: o.entry_source != null ? String(o.entry_source).slice(0, 80) : null,
      referral_id: o.referral_id != null ? String(o.referral_id).slice(0, 120) : null,
      conversion_step: o.conversion_step != null ? String(o.conversion_step).slice(0, 80) : null,
      ecosystem: o.ecosystem != null ? String(o.ecosystem).slice(0, 16) : null,
      user_id: userId,
      meta: typeof o.meta === 'object' && o.meta !== null ? o.meta : {},
    };
  });

  const { error } = await supabase.from('public_growth_events').insert(rows);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, inserted: rows.length });
}
