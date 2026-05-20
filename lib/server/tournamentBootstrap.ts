import type { SupabaseClient } from '@supabase/supabase-js';

import {
  isAsyncTournamentForLaunch,
  isLaunchCountdownComplete,
  isLiveTournamentForLaunch,
  resolveLiveLaunchEntrantIds,
  type LaunchEntryRow,
} from '@/lib/tournamentLaunchAttendance';
import {
  isTournamentBracketFull,
  orderedUserIdsFromTournamentEntries,
} from '@/lib/server/tournamentOperator';
import { persistTournamentBracket, TournamentBracketPersistError } from '@/lib/tournamentPersist';

export type TournamentBootstrapResult =
  | {
      ok: true;
      tournament_id: string;
      idempotent_replay: boolean;
      match_count: number;
      game_ids: string[];
      launch_attendance_applied: boolean;
      present_count?: number;
      skipped_user_ids?: string[];
      promoted_standby_user_ids?: string[];
    }
  | { ok: false; status: number; error: string; code?: string; detail?: Record<string, unknown> };

type EntryDb = {
  user_id: string;
  seed: number | null;
  entry_role?: string | null;
  checked_in_at?: string | null;
  last_seen_at?: string | null;
};

export async function runTournamentBootstrap(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<TournamentBootstrapResult> {
  const { data: tRow, error: tErr } = await supabase
    .from('tournaments')
    .select('id, status, tempo, live_time_control, launch_scheduled_at')
    .eq('id', tournamentId)
    .maybeSingle();
  if (tErr) return { ok: false, status: 502, error: tErr.message };
  if (!tRow) return { ok: false, status: 404, error: 'Tournament not found.', code: 'TOURNAMENT_NOT_FOUND' };

  if (String(tRow.status ?? '').toLowerCase() !== 'pending') {
    return { ok: false, status: 409, error: 'Tournament must be pending to start the bracket.' };
  }

  const { data: entries, error: eErr } = await supabase
    .from('tournament_entries')
    .select('user_id, seed, entry_role, checked_in_at, last_seen_at')
    .eq('tournament_id', tournamentId);
  if (eErr) return { ok: false, status: 502, error: eErr.message };

  const entryRows = (entries ?? []) as EntryDb[];
  const entrantCount = entryRows.filter((e) => String(e.entry_role ?? 'entrant') === 'entrant').length;
  if (!isTournamentBracketFull(entrantCount)) {
    return {
      ok: false,
      status: 409,
      error: 'Not enough entrants to start — bracket must be full (power-of-2 field, min 2).',
      detail: { entrant_count: entrantCount },
    };
  }

  const { count: matchCount, error: mErr } = await supabase
    .from('tournament_matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);
  if (mErr) return { ok: false, status: 502, error: mErr.message };
  if ((matchCount ?? 0) > 0) {
    return { ok: false, status: 409, error: 'Bracket already exists for this tournament.' };
  }

  const tempo = tRow.tempo != null ? String(tRow.tempo) : null;
  const isLive = isLiveTournamentForLaunch(tempo);
  const isAsync = isAsyncTournamentForLaunch(tempo);

  let orderedUserIds: string[];
  let launchAttendanceApplied = false;
  let presentCount: number | undefined;
  let skippedUserIds: string[] | undefined;
  let promotedStandbyUserIds: string[] | undefined;

  if (isLive) {
    const launchAt = tRow.launch_scheduled_at != null ? String(tRow.launch_scheduled_at) : null;
    if (launchAt && !isLaunchCountdownComplete(launchAt)) {
      return {
        ok: false,
        status: 409,
        error: 'Launch countdown still in progress. Wait for the timer before starting the bracket.',
        code: 'LAUNCH_COUNTDOWN_ACTIVE',
      };
    }

    const launchEntries: LaunchEntryRow[] = entryRows.map((e) => ({
      userId: e.user_id,
      seed: e.seed,
      entryRole: String(e.entry_role ?? 'entrant') === 'standby' ? 'standby' : 'entrant',
      checkedInAt: e.checked_in_at != null ? String(e.checked_in_at) : null,
      lastSeenAt: e.last_seen_at != null ? String(e.last_seen_at) : null,
    }));

    const resolved = resolveLiveLaunchEntrantIds(
      launchEntries,
      entrantCount,
    );
    if (!resolved.ok) {
      return {
        ok: false,
        status: 409,
        error: resolved.detail,
        code: resolved.code,
        detail: {
          present_count: resolved.presentCount,
          required_count: resolved.requiredCount,
          skipped_user_ids: resolved.skippedUserIds,
          standby_available: resolved.standbyAvailable,
        },
      };
    }

    for (const uid of resolved.skippedUserIds) {
      await supabase
        .from('tournament_entries')
        .update({ launch_skip_reason: 'absent_at_live_launch' })
        .eq('tournament_id', tournamentId)
        .eq('user_id', uid);
    }

    orderedUserIds = resolved.orderedUserIds;
    launchAttendanceApplied = true;
    presentCount = resolved.presentUserIds.length;
    skippedUserIds = resolved.skippedUserIds;
    promotedStandbyUserIds = resolved.promotedStandbyUserIds;
  } else if (isAsync) {
    orderedUserIds = orderedUserIdsFromTournamentEntries(
      entryRows
        .filter((e) => String(e.entry_role ?? 'entrant') === 'entrant')
        .map((e) => ({ userId: e.user_id, seed: e.seed })),
    );
  } else {
    orderedUserIds = orderedUserIdsFromTournamentEntries(
      entryRows.map((e) => ({ userId: e.user_id, seed: e.seed })),
    );
  }

  try {
    const result = await persistTournamentBracket(supabase, tournamentId, orderedUserIds);
    const gameIds = result.matchRows.map((m) => m.game_id).filter((x): x is string => Boolean(x));

    await supabase
      .from('tournaments')
      .update({ launch_scheduled_at: null })
      .eq('id', tournamentId);

    return {
      ok: true,
      tournament_id: tournamentId,
      idempotent_replay: Boolean(result.idempotentReplay),
      match_count: result.matchRows.length,
      game_ids: gameIds,
      launch_attendance_applied: launchAttendanceApplied,
      present_count: presentCount,
      skipped_user_ids: skippedUserIds,
      promoted_standby_user_ids: promotedStandbyUserIds,
    };
  } catch (e) {
    if (e instanceof TournamentBracketPersistError) {
      return { ok: false, status: 409, error: e.message };
    }
    const message = e instanceof Error ? e.message : 'Bootstrap failed';
    return { ok: false, status: 502, error: message };
  }
}
