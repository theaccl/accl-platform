import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import type { NexusEcosystem, NexusLeader } from '@/lib/nexus/getNexusData';

function fallbackLeader(label: string): NexusLeader {
  return {
    user_id: null,
    label,
    username: 'No data yet',
    value: '—',
    tier: null,
    flag: '♟',
  };
}

export async function getSystemLeaders(ecosystem: NexusEcosystem): Promise<{
  number_one: NexusLeader;
  top_earner: NexusLeader;
  streak_leader: NexusLeader;
}> {
  const supabase = createServiceRoleClient();
  const { data: games } = await supabase
    .from('games')
    .select('winner_id,finished_at')
    .eq('status', 'finished')
    .eq('ecosystem_scope', ecosystem)
    .order('finished_at', { ascending: false })
    .limit(1200);

  const wins = new Map<string, number>();
  const streak = new Map<string, number>();
  const recentByWinner: string[] = [];
  for (const g of games ?? []) {
    const w = String(g.winner_id ?? '').trim();
    if (!w) continue;
    wins.set(w, (wins.get(w) ?? 0) + 1);
    recentByWinner.push(w);
  }
  // quick streak approximation from recency window
  for (const id of recentByWinner) {
    const current = streak.get(id) ?? 0;
    streak.set(id, current + 1);
  }

  const rankWins = [...wins.entries()].sort((a, b) => b[1] - a[1]);
  const rankStreak = [...streak.entries()].sort((a, b) => b[1] - a[1]);

  const ids = [...new Set([rankWins[0]?.[0], rankWins[1]?.[0], rankStreak[0]?.[0]].filter(Boolean) as string[])];
  let nameById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id,username').in('id', ids);
    nameById = new Map((profiles ?? []).map((p) => [String(p.id), String(p.username ?? 'Player')]));
  }

  const number_one = rankWins[0]
    ? {
        user_id: rankWins[0][0],
        label: '#1 Player',
        username: nameById.get(rankWins[0][0]) ?? 'Player',
        value: `${rankWins[0][1]} wins`,
        tier: 'S',
        flag: '🥇',
      }
    : fallbackLeader('#1 Player');

  const top_earner = rankWins[1]
    ? {
        user_id: rankWins[1][0],
        label: 'Top Earner',
        username: nameById.get(rankWins[1][0]) ?? 'Player',
        value: `$${rankWins[1][1] * 5}`,
        tier: 'A',
        flag: '💰',
      }
    : fallbackLeader('Top Earner');

  const streak_leader = rankStreak[0]
    ? {
        user_id: rankStreak[0][0],
        label: 'Streak Leader',
        username: nameById.get(rankStreak[0][0]) ?? 'Player',
        value: `${rankStreak[0][1]} streak`,
        tier: 'A',
        flag: '🔥',
      }
    : fallbackLeader('Streak Leader');

  return { number_one, top_earner, streak_leader };
}

