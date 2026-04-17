import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import type { NexusEcosystem, NexusStanding } from '@/lib/nexus/getNexusData';

export async function getStandings(ecosystem: NexusEcosystem): Promise<NexusStanding[]> {
  const supabase = createServiceRoleClient();
  const { data: games } = await supabase
    .from('games')
    .select('white_player_id,black_player_id,winner_id')
    .eq('status', 'finished')
    .eq('ecosystem_scope', ecosystem)
    .limit(2500);

  const stats = new Map<string, { wins: number; games: number; streak: number; earned: number }>();
  for (const g of games ?? []) {
    const white = String(g.white_player_id ?? '').trim();
    const black = String(g.black_player_id ?? '').trim();
    const winner = String(g.winner_id ?? '').trim();
    for (const id of [white, black]) {
      if (!id) continue;
      const s = stats.get(id) ?? { wins: 0, games: 0, streak: 0, earned: 0 };
      s.games += 1;
      stats.set(id, s);
    }
    if (winner) {
      const s = stats.get(winner) ?? { wins: 0, games: 0, streak: 0, earned: 0 };
      s.wins += 1;
      s.streak += 1;
      s.earned += 5;
      stats.set(winner, s);
    }
  }

  const ids = [...stats.keys()].slice(0, 500);
  const { data: profiles } = ids.length
    ? await supabase.from('profiles').select('id,username').in('id', ids)
    : { data: [] as Array<{ id: string; username: string | null }> };
  const nameById = new Map((profiles ?? []).map((p) => [String(p.id), String(p.username ?? 'Player')]));

  const { data: tuRows } = ids.length
    ? await supabase
        .from('player_ratings')
        .select('user_id,rating')
        .eq('bucket', 'tournament_unified')
        .in('user_id', ids)
    : { data: [] as Array<{ user_id: string; rating: number }> };
  const tuByUser = new Map((tuRows ?? []).map((r) => [String(r.user_id), Number(r.rating)]));

  const ranked = [...stats.entries()]
    .map(([id, s]) => ({
      user_id: id,
      username: ecosystem === 'k12' ? `K12-${id.slice(0, 6)}` : nameById.get(id) ?? `P-${id.slice(0, 6)}`,
      wins: s.wins,
      games: s.games,
      streak: s.streak,
      earned: s.earned,
      rating: tuByUser.get(id) ?? 1000 + s.wins * 8,
      tier: s.wins > 30 ? 'S' : s.wins > 20 ? 'A' : s.wins > 10 ? 'B' : 'C',
      flag: '♞',
    }))
    .sort((a, b) => b.wins - a.wins || b.rating - a.rating || a.user_id.localeCompare(b.user_id))
    .slice(0, 200);

  return ranked.map((r, i) => ({ rank: i + 1, ...r }));
}

