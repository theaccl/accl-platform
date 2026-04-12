import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import type { NexusEcosystem, NexusLiveGame } from '@/lib/nexus/getNexusData';

const WATCH_TCS = new Set(['10m', '15m', '30m', '60m']);

export async function getLiveGames(ecosystem: NexusEcosystem): Promise<NexusLiveGame[]> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('games')
    .select('id,white_player_id,black_player_id,status,fen,live_time_control,tempo,ecosystem_scope,tournament_id,white_clock_ms,black_clock_ms,updated_at')
    .eq('status', 'active')
    .eq('tempo', 'live')
    .eq('ecosystem_scope', ecosystem)
    .order('updated_at', { ascending: false })
    .limit(120);

  const rows = data ?? [];
  const preferred = rows.filter((r) => WATCH_TCS.has(String(r.live_time_control ?? '')));
  const poolRaw = (preferred.length > 0 ? preferred : rows).slice(0, 20);
  const pool = [...poolRaw].sort((a, b) => {
    const ua = String(a.updated_at ?? '');
    const ub = String(b.updated_at ?? '');
    const t = Date.parse(ub) - Date.parse(ua);
    if (t !== 0) return t;
    return String(a.id).localeCompare(String(b.id));
  });
  const ids = [...new Set(pool.flatMap((r) => [String(r.white_player_id ?? ''), String(r.black_player_id ?? '')]).filter(Boolean))];
  const tidList = [...new Set(pool.map((r) => String(r.tournament_id ?? '')).filter(Boolean))];

  const [profilesRes, tournamentsRes] = await Promise.all([
    ids.length > 0 ? supabase.from('profiles').select('id,username,rating').in('id', ids) : Promise.resolve({ data: [] as { id: string; username: string | null; rating: number | null }[] }),
    tidList.length > 0
      ? supabase.from('tournaments').select('id,name,status').in('id', tidList).eq('ecosystem_scope', ecosystem)
      : Promise.resolve({ data: [] as { id: string; name: string | null; status: string | null }[] }),
  ]);
  const profiles = new Map((profilesRes.data ?? []).map((p) => [String(p.id), p]));
  const tournaments = new Map((tournamentsRes.data ?? []).map((t) => [String(t.id), t]));
  const maskK12 = (id: string) => `K12-${id.replace(/-/g, '').slice(0, 6) || 'player'}`;
  const playerLabel = (id: string, fallback: string) => {
    if (ecosystem === 'k12') return maskK12(id);
    const p = profiles.get(id);
    return p?.username?.trim() ? p.username.trim() : fallback;
  };

  return pool.map((r) => ({
    id: String(r.id),
    white_label: (() => {
      const id = String(r.white_player_id ?? '');
      return playerLabel(id, `W:${id.slice(0, 6) || '—'}`);
    })(),
    black_label: (() => {
      const id = String(r.black_player_id ?? '');
      return playerLabel(id, `B:${id.slice(0, 6) || '—'}`);
    })(),
    white_player_id: (r.white_player_id as string | null) ?? null,
    black_player_id: (r.black_player_id as string | null) ?? null,
    white_rating: (() => {
      const p = profiles.get(String(r.white_player_id ?? ''));
      return typeof p?.rating === 'number' ? p.rating : null;
    })(),
    black_rating: (() => {
      const p = profiles.get(String(r.black_player_id ?? ''));
      return typeof p?.rating === 'number' ? p.rating : null;
    })(),
    white_tier: null,
    black_tier: null,
    time_control: String(r.live_time_control ?? 'live'),
    status: String(r.status ?? 'active'),
    is_live: true,
    fen: String(r.fen ?? ''),
    move_count: (() => {
      const fen = String(r.fen ?? '').trim();
      const fullmove = Number(fen.split(' ')[5] ?? 1);
      return Number.isFinite(fullmove) ? Math.max(0, fullmove - 1) : 0;
    })(),
    white_clock_ms: typeof r.white_clock_ms === 'number' ? r.white_clock_ms : null,
    black_clock_ms: typeof r.black_clock_ms === 'number' ? r.black_clock_ms : null,
    tournament_id: (r.tournament_id as string | null) ?? null,
    tournament_name: (() => tournaments.get(String(r.tournament_id ?? ''))?.name ?? null)(),
    tournament_status: (() => tournaments.get(String(r.tournament_id ?? ''))?.status ?? null)(),
  }));
}

