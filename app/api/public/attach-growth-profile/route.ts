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

export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request);
  const limited = checkRateLimit(`attach-growth:${ip}`, 20, 60_000);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSec);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon || !serviceKey) return json({ ok: false, error: 'server_misconfigured' }, 500);

  const authHeader = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) return json({ ok: false, error: 'unauthorized' }, 401);
  const token = m[1]?.trim();
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401);

  const authClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData.user?.id) return json({ ok: false, error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  let body: { referral_id?: string; entry_source?: string; conversion_event?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const referral_id = body.referral_id?.trim().slice(0, 120) || null;
  const entry_source = body.entry_source?.trim().slice(0, 80) || null;
  const conversion_event = body.conversion_event?.trim().slice(0, 80) || null;

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: prof } = await admin.from('profiles').select('referral_id').eq('id', userId).maybeSingle();
  const patch: Record<string, string> = {};
  if (referral_id && !prof?.referral_id) patch.referral_id = referral_id;
  if (entry_source) patch.entry_source = entry_source;
  if (conversion_event) patch.conversion_event = conversion_event;
  if (Object.keys(patch).length === 0) return json({ ok: true, skipped: true });

  const { error } = await admin.from('profiles').update(patch).eq('id', userId);

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
}
