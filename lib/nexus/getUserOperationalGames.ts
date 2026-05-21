import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import { isLiveContinuityGame, type GameContinuityRow } from '@/lib/gameContinuityPresentation';
import { isLobbyYourMove } from '@/lib/lobbyObligationPresentation';
import { PLAT_MODE_ORDER, type PlatMode } from '@/lib/freePlayModeTimeControl';
import { platModeForLobbyRow } from '@/lib/lobbyModeFilter';
import { formatGameTimeControlLabel } from '@/lib/gameTimeControl';

export type NexusOperationalGameRow = {
  id: string;
  href: string;
  mode: PlatMode | null;
  tempoLabel: string;
  isLive: boolean;
  isYourMove: boolean;
  isTournament: boolean;
  clockRemainingMs: number | null;
  opponentLabel: string;
  status: string;
};

function clockRemainingMsForUser(
  row: GameContinuityRow & {
    white_clock_ms?: number | null;
    black_clock_ms?: number | null;
    turn?: string | null;
  },
  uid: string,
): number | null {
  const t = String(row.turn ?? '').trim().toLowerCase();
  if (t === 'white' && row.white_player_id === uid && Number.isFinite(row.white_clock_ms)) {
    return Number(row.white_clock_ms);
  }
  if (t === 'black' && row.black_player_id === uid && Number.isFinite(row.black_clock_ms)) {
    return Number(row.black_clock_ms);
  }
  return null;
}

export function sortOperationalRows(rows: NexusOperationalGameRow[]): NexusOperationalGameRow[] {
  return [...rows].sort((a, b) => {
    if (a.isYourMove !== b.isYourMove) return a.isYourMove ? -1 : 1;
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    const ac = a.clockRemainingMs;
    const bc = b.clockRemainingMs;
    if (ac != null && bc != null && ac !== bc) return ac - bc;
    if (ac != null && bc == null) return -1;
    if (ac == null && bc != null) return 1;
    return a.id.localeCompare(b.id);
  });
}

/** Viewer's active obligations for NEXUS hub (not global spectator feed). */
export async function getUserOperationalGamesForNexus(userId: string): Promise<NexusOperationalGameRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('games')
    .select(
      'id,status,tempo,live_time_control,turn,white_player_id,black_player_id,white_clock_ms,black_clock_ms,tournament_id,play_context',
    )
    .in('status', ['active', 'waiting'])
    .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
    .order('updated_at', { ascending: false })
    .limit(32);

  if (error || !data?.length) return [];

  const ids = [
    ...new Set(
      (data as { white_player_id: string; black_player_id: string | null }[])
        .flatMap((r) => [r.white_player_id, r.black_player_id])
        .filter((id): id is string => Boolean(id) && id !== userId),
    ),
  ];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id,username').in('id', ids);
    for (const p of profs ?? []) {
      const id = String((p as { id: string }).id);
      const u = String((p as { username: string | null }).username ?? '').trim();
      if (u) names.set(id, u);
    }
  }

  const rows: NexusOperationalGameRow[] = [];
  for (const raw of data) {
    const r = raw as GameContinuityRow & {
      tournament_id?: string | null;
      play_context?: string | null;
      white_clock_ms?: number | null;
      black_clock_ms?: number | null;
    };
    const isTournament = String(r.play_context ?? '') === 'tournament' && Boolean(r.tournament_id);
    const isLive = isLiveContinuityGame(r);
    const yourMove = isLobbyYourMove(r, userId);
    if (isLive && !yourMove && !isTournament && r.black_player_id) continue;
    const oppId =
      r.white_player_id === userId ? r.black_player_id : r.black_player_id === userId ? r.white_player_id : null;
    rows.push({
      id: String(r.id),
      href: `/game/${r.id}`,
      mode: platModeForLobbyRow(r),
      tempoLabel: formatGameTimeControlLabel(r.tempo, r.live_time_control),
      isLive,
      isYourMove: yourMove,
      isTournament,
      clockRemainingMs: clockRemainingMsForUser(r, userId),
      opponentLabel: oppId ? names.get(oppId) ?? 'Opponent' : 'Waiting for opponent',
      status: String(r.status ?? 'active'),
    });
  }

  return sortOperationalRows(rows);
}

export function groupOperationalGamesByMode(
  rows: NexusOperationalGameRow[],
): Partial<Record<PlatMode, NexusOperationalGameRow[]>> {
  const out: Partial<Record<PlatMode, NexusOperationalGameRow[]>> = {};
  for (const mode of PLAT_MODE_ORDER) {
    const slice = rows.filter((r) => r.mode === mode);
    if (slice.length > 0) out[mode] = slice;
  }
  return out;
}
