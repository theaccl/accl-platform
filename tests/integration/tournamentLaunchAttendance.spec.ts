import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { runTournamentBootstrap } from '@/lib/server/tournamentBootstrap';

function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0 && !process.env[t.slice(0, i).trim()]) {
      process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
}

loadEnvLocal();

const hasDb =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { persistSession: false } },
  );
}

test.describe('Phase 1 — live launch attendance (integration)', () => {
  test.skip(!hasDb, 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

  test('runTournamentBootstrap uses check-in for live and bypasses for daily', async () => {
    const supabase = serviceClient();
    const { error: colErr } = await supabase
      .from('tournament_entries')
      .select('checked_in_at, entry_role, launch_skip_reason')
      .limit(1);
    if (colErr?.message?.includes('checked_in_at') || colErr?.code === '42703') {
      test.skip(true, 'Apply 20260519180000_tournament_launch_checkin.sql');
    }

    const { data: profiles } = await supabase.from('profiles').select('id').limit(4);
    expect((profiles ?? []).length).toBeGreaterThanOrEqual(4);
    const ids = (profiles ?? []).map((r) => String(r.id));
    const [p1, p2, p3, p4] = ids;
    const now = new Date().toISOString();

    const { data: creator } = await supabase.from('profiles').select('id').limit(1).single();

    const { data: liveT } = await supabase
      .from('tournaments')
      .insert({
        name: `IT live launch ${Date.now()}`,
        status: 'pending',
        format: 'single_elimination',
        tempo: 'live',
        rated: false,
        created_by: creator!.id,
        ecosystem_scope: 'adult',
      })
      .select('id')
      .single();
    expect(liveT?.id).toBeTruthy();

    await supabase.from('tournament_entries').insert([
      { tournament_id: liveT!.id, user_id: p1, entry_role: 'entrant' },
      { tournament_id: liveT!.id, user_id: p2, entry_role: 'entrant', checked_in_at: now, last_seen_at: now },
      { tournament_id: liveT!.id, user_id: p3, entry_role: 'entrant', checked_in_at: now, last_seen_at: now },
      { tournament_id: liveT!.id, user_id: p4, entry_role: 'entrant', checked_in_at: now, last_seen_at: now },
    ]);

    const blocked = await runTournamentBootstrap(supabase, liveT!.id);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe('not_enough_present');

    const { count: liveMatchesBlocked } = await supabase
      .from('tournament_matches')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', liveT!.id);
    expect(liveMatchesBlocked).toBe(0);

    await supabase
      .from('tournament_entries')
      .update({ checked_in_at: now, last_seen_at: now })
      .eq('tournament_id', liveT!.id)
      .eq('user_id', p1);

    const started = await runTournamentBootstrap(supabase, liveT!.id);
    expect(started.ok).toBe(true);
    if (started.ok) {
      expect(started.launch_attendance_applied).toBe(true);
      expect(started.match_count).toBeGreaterThan(0);
    }

    const { data: dailyT } = await supabase
      .from('tournaments')
      .insert({
        name: `IT daily launch ${Date.now()}`,
        status: 'pending',
        format: 'single_elimination',
        tempo: 'daily',
        rated: false,
        created_by: creator!.id,
        ecosystem_scope: 'adult',
      })
      .select('id')
      .single();

    await supabase.from('tournament_entries').insert(
      ids.map((user_id) => ({ tournament_id: dailyT!.id, user_id, entry_role: 'entrant' })),
    );

    const dailyStart = await runTournamentBootstrap(supabase, dailyT!.id);
    expect(dailyStart.ok).toBe(true);
    if (dailyStart.ok) expect(dailyStart.launch_attendance_applied).toBe(false);

    await supabase.from('tournament_matches').delete().eq('tournament_id', liveT!.id);
    await supabase.from('tournament_entries').delete().eq('tournament_id', liveT!.id);
    await supabase.from('tournaments').delete().eq('id', liveT!.id);
    await supabase.from('tournament_matches').delete().eq('tournament_id', dailyT!.id);
    await supabase.from('tournament_entries').delete().eq('tournament_id', dailyT!.id);
    await supabase.from('tournaments').delete().eq('id', dailyT!.id);
  });
});
