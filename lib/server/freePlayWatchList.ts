import { PLAT_MODE_ORDER, type PlatMode } from '@/lib/freePlayModeTimeControl';
import { formatGameTimeControlLabel } from '@/lib/gameTimeControl';
import { normalizeGameTempo } from '@/lib/gameTempo';
import { platBucketForOpenSeat } from '@/lib/platOpenSeatBucket';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export type FreePlayWatchListRow = {
  id: string;
  whiteLabel: string;
  blackLabel: string;
  timeLabel: string;
  mode: PlatMode;
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
 */
export async function fetchFreePlaySpectatableLobby(ecosystem: 'adult' | 'k12'): Promise<{
  byMode: Record<PlatMode, FreePlayWatchListRow[]>;
  watchActivity: Record<PlatMode, boolean>;
}> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('games')
    .select('id,tempo,live_time_control,white_player_id,black_player_id,updated_at')
    .eq('play_context', 'free')
    .is('tournament_id', null)
    .eq('status', 'active')
    .eq('ecosystem_scope', ecosystem)
    .eq('tempo', 'live')
    .not('white_player_id', 'is', null)
    .not('black_player_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(100);

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
  const perModeCap = 5;

  for (const r of dataRows) {
    let mode = platBucketForOpenSeat(r.tempo as string | null, r.live_time_control as string | null);
    if (!mode && normalizeGameTempo(r.tempo as string | null) === 'live') {
      mode = 'rapid';
    }
    if (!mode) continue;
    if (byMode[mode].length >= perModeCap) continue;
    const wid = String(r.white_player_id ?? '');
    const bid = String(r.black_player_id ?? '');
    if (!wid || !bid) continue;
    byMode[mode].push({
      id: String(r.id),
      whiteLabel: profileName(wid, 'W'),
      blackLabel: profileName(bid, 'B'),
      timeLabel: formatGameTimeControlLabel(r.tempo as string | null, r.live_time_control as string | null),
      mode,
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
