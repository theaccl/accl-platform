import { createClient } from '@supabase/supabase-js';

import { e2eUserBEmail, e2eUserEmail } from '../fixtures/env';

export type E2eTeardownResult = { ran: boolean; reason: string };

/**
 * Best-effort cleanup of rows left by two-user E2E flows.
 *
 * **Requires** `E2E_SUPABASE_SERVICE_ROLE_KEY` (never commit) plus `E2E_SUPABASE_URL` or
 * `NEXT_PUBLIC_SUPABASE_URL`. Uses the Supabase service role so it bypasses RLS (no fake client deletes).
 *
 * **Scope (intentionally narrow):** profile ids resolved from `E2E_USER_EMAIL` / `E2E_USER_B_EMAIL` only.
 * - `match_requests` with `status = 'pending'` where both `from_user_id` and `to_user_id` are in that id set.
 * - `games` with `status = 'active'` where both seats are in that id set (pair tables).
 * - `games` open-seat rows: `status = 'active'`, `black_player_id` null, `white_player_id` in that id set.
 *
 * **If service_role keys are disallowed in CI**, add a migration such as
 * `supabase/migrations/<timestamp>_e2e_teardown_pair.sql` defining:
 *
 * ```sql
 * create or replace function public.e2e_teardown_accl_pair(p_secret text)
 * returns void language plpgsql security definer set search_path = public as $$
 * begin
 *   if p_secret is null or p_secret <> current_setting('app.e2e_teardown_secret', true) then
 *     raise exception 'unauthorized';
 *   end if;
 *   -- mirror JS scope: pending match_requests + active games between configured test profiles only
 *   -- (resolve emails via parameter or hard-coded staging UUIDs per env; keep deletes narrow).
 * end;
 * $$;
 * revoke all on function public.e2e_teardown_accl_pair(text) from public;
 * grant execute on function public.e2e_teardown_accl_pair(text) to service_role;
 * ```
 *
 * Call from tests: `supabase.rpc('e2e_teardown_accl_pair', { p_secret: process.env.E2E_TEARDOWN_SECRET })`
 * using a **service_role** Supabase client only. Do **not** grant `execute` to `anon` / `authenticated`.
 *
 * @returns whether any delete was attempted (still check `reason` if `ran` is false).
 */
export async function teardownE2ePairStaleRows(): Promise<E2eTeardownResult> {
  const url =
    process.env.E2E_SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!url || !key) {
    return {
      ran: false,
      reason:
        'DB teardown skipped: set E2E_SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and E2E_SUPABASE_SERVICE_ROLE_KEY for service-role cleanup.',
    };
  }

  const aEmail = e2eUserEmail()?.toLowerCase();
  const bEmail = e2eUserBEmail()?.toLowerCase();
  if (!aEmail || !bEmail) {
    return { ran: false, reason: 'DB teardown skipped: E2E_USER_EMAIL and E2E_USER_B_EMAIL required.' };
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id')
    .in('email', [aEmail, bEmail]);

  if (pErr) {
    return { ran: false, reason: `DB teardown: profile lookup failed — ${pErr.message}` };
  }

  const ids = [...new Set((profiles ?? []).map((p) => p.id).filter(Boolean))];
  if (ids.length === 0) {
    return { ran: false, reason: 'DB teardown: no profiles for configured E2E emails.' };
  }

  const { error: mrErr } = await supabase
    .from('match_requests')
    .delete()
    .eq('status', 'pending')
    .in('from_user_id', ids)
    .in('to_user_id', ids);

  if (mrErr) {
    return { ran: false, reason: `DB teardown: match_requests delete failed — ${mrErr.message}` };
  }

  const { error: gPairErr } = await supabase
    .from('games')
    .delete()
    .eq('status', 'active')
    .in('white_player_id', ids)
    .in('black_player_id', ids);

  if (gPairErr) {
    return { ran: false, reason: `DB teardown: games (pair) delete failed — ${gPairErr.message}` };
  }

  const { error: gOpenErr } = await supabase
    .from('games')
    .delete()
    .eq('status', 'active')
    .in('white_player_id', ids)
    .is('black_player_id', null);

  if (gOpenErr) {
    return { ran: false, reason: `DB teardown: games (open seat) delete failed — ${gOpenErr.message}` };
  }

  return { ran: true, reason: 'Teardown executed (pending pair requests, active pair games, open seats for E2E users).' };
}
