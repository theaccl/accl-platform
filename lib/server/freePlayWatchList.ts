import { PLAT_MODE_ORDER, type PlatMode } from '@/lib/freePlayModeTimeControl';
import { canonicalLiveTimeControlForInsert, formatGameTimeControlLabel } from '@/lib/gameTimeControl';
import { normalizeGameTempo } from '@/lib/gameTempo';
import { isLiveGameWatchableByClock } from '@/lib/liveClockExpiry';
import { platBucketForOpenSeat } from '@/lib/platOpenSeatBucket';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export type FreePlayWatchListRow = {
  id: string;
  whiteLabel: string;
  blackLabel: string;
  timeLabel: string;
  mode: PlatMode;
  /** Canonical `games.live_time_control` token for filtering watch lists by selected clock. */
  liveTimeControlKey: string;
};

const emptyByMode = (): Record<PlatMode, FreePlayWatchListRow[]> =>
  PLAT_MODE_ORDER.reduce(
    (acc, m) => {
      acc[m] = [];
      return acc;
    },
    {} as Record<PlatMode, FreePlayWatchListRow[]>,
  );

function maskK12(id: string): string {
  return `K12-${id.replace(/-/g, '').slice(0, 6) || 'player'}`;
}

/**
 * Free-play live games with both players seated — for lobby “Watch as spectator” discovery.
 * Uses service role (same family as Nexus live games); do not expose raw SQL to the client.
 *
 * @param options.excludeUserId — seated players do not see their own game in spectate discovery (use resume instead).
 */
export async function fetchFreePlaySpectatableLobby(
  ecosystem: 'adult' | 'k12',
  options?: { excludeUserId?: string | null }
): Promise<{
  byMode: Record<PlatMode, FreePlayWatchListRow[]>;
  watchActivity: Record<PlatMode, boolean>;
}> {
  const ex = String(options?.excludeUserId ?? '').trim().toLowerCase();
  const supabase = createServiceRoleClient();
  const nowMs = Date.now();
  const { data, error } = await supabase
    .from('games')
    .select(
      'id,tempo,live_time_control,white_player_id,black_player_id,updated_at,status,turn,last_move_at,white_clock_ms,black_clock_ms',
    )
    .eq('play_context', 'free')
    .is('tournament_id', null)
    // Align with getActiveFreePlayGameForUser / free lobby: live rows can be active or waiting while playable.
    .in('status', ['active', 'waiting'])
    .eq('ecosystem_scope', ecosystem)
    .eq('tempo', 'live')
    .not('white_player_id', 'is', null)
    .not('black_player_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[fetchFreePlaySpectatableLobby]', error.message);
  }

  const dataRows = data ?? [];
  if (!dataRows.length) {
    const empty = emptyByMode();
    return {
      byMode: empty,
      watchActivity: PLAT_MODE_ORDER.reduce(
        (acc, m) => {
          acc[m] = false;
          return acc;
        },
        {} as Record<PlatMode, boolean>,
      ),
    };
  }

  const ids = [
    ...new Set(
      dataRows.flatMap((r) => [String(r.white_player_id ?? ''), String(r.black_player_id ?? '')]).filter(Boolean),
    ),
  ];
  let profileRows: { id: string; username: string | null }[] = [];
  if (ids.length > 0) {
    const pr = await supabase.from('profiles').select('id,username').in('id', ids);
    profileRows = (pr.data ?? []) as { id: string; username: string | null }[];
  }

  const profileName = (id: string, side: 'W' | 'B') => {
    if (ecosystem === 'k12') return maskK12(id);
    const p = profileRows.find((x) => x.id === id);
    const u = p?.username?.trim();
    return u || `${side}:${id.slice(0, 6) || '—'}`;
  };

  const byMode = emptyByMode();
  /** How many live boards to show per PLAT mode (larger = fewer “missing” in busy lobbies; still cheap). */
  const perModeCap = 15;

  for (const r of dataRows) {
    const wid = String(r.white_player_id ?? '');
    const bid = String(r.black_player_id ?? '');
    if (!wid || !bid) continue;
    if (ex && (wid.trim().toLowerCase() === ex || bid.trim().toLowerCase() === ex)) continue;
    if (!isLiveGameWatchableByClock(r, nowMs)) continue;
    let mode = platBucketForOpenSeat(r.tempo as string | null, r.live_time_control as string | null);
    if (!mode && normalizeGameTempo(r.tempo as string | null) === 'live') {
      mode = 'rapid';
    }
    if (!mode) continue;
    if (byMode[mode].length >= perModeCap) continue;
    const tempo = r.tempo as string | null;
    const ltcKey =
      canonicalLiveTimeControlForInsert(tempo, r.live_time_control as string | null) ??
      String(r.live_time_control ?? '')
        .trim()
        .toLowerCase();
    byMode[mode].push({
      id: String(r.id),
      whiteLabel: profileName(wid, 'W'),
      blackLabel: profileName(bid, 'B'),
      timeLabel: formatGameTimeControlLabel(tempo, r.live_time_control as string | null),
      mode,
      liveTimeControlKey: ltcKey,
    });
  }

  const watchActivity = PLAT_MODE_ORDER.reduce(
    (acc, m) => {
      acc[m] = byMode[m].length > 0;
      return acc;
    },
    {} as Record<PlatMode, boolean>,
  );

  return { byMode, watchActivity };
}
