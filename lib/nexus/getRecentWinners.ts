import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import type { NexusEcosystem, NexusPayoutCategory, NexusWinner } from '@/lib/nexus/getNexusData';

export async function getRecentWinners(ecosystem: NexusEcosystem): Promise<NexusWinner[]> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('games')
    .select('id,winner_id,tournament_id,finished_at')
    .eq('status', 'finished')
    .eq('ecosystem_scope', ecosystem)
    .not('winner_id', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(40);

  const scoped = data ?? [];
  const pool = scoped.slice(0, 24);
  const winnerIds = [...new Set(pool.map((r) => String(r.winner_id ?? '')).filter(Boolean))];
  const tournamentIds = [...new Set(pool.map((r) => String(r.tournament_id ?? '')).filter(Boolean))];
  const [profilesRes, tournamentsRes] = await Promise.all([
    winnerIds.length > 0
      ? supabase.from('profiles').select('id,username').in('id', winnerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; username: string | null }> }),
    tournamentIds.length > 0
      ? supabase.from('tournaments').select('id,name').in('id', tournamentIds).eq('ecosystem_scope', ecosystem)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
  ]);
  const profileMap = new Map((profilesRes.data ?? []).map((p) => [String(p.id), String(p.username ?? '')]));
  const tournamentMap = new Map((tournamentsRes.data ?? []).map((t) => [String(t.id), String(t.name ?? '')]));

  const labelFor = (id: string) => {
    if (ecosystem === 'k12') return `K12-${id.replace(/-/g, '').slice(0, 6)}`;
    const username = profileMap.get(id)?.trim();
    return username || `P-${id.slice(0, 6)}`;
  };

  return pool.slice(0, 12).map((r) => {
    const winnerId = String(r.winner_id ?? '');
    const tid = String(r.tournament_id ?? '');
    const eventName = tid ? tournamentMap.get(tid)?.trim() || `Tournament ${tid.slice(0, 6)}` : 'Free Match';
    const isK12 = ecosystem === 'k12';
    const category: NexusPayoutCategory = isK12
      ? 'recognition'
      : tid
        ? 'tournament_win'
        : 'free_finish';
    return {
      id: String(r.id),
      player_label: labelFor(winnerId),
      tier: tid ? 'Tournament' : 'Free',
      amount_won: isK12 ? 0 : tid ? 25 : 5,
      event_name: eventName,
      utc: String(r.finished_at ?? new Date().toISOString()),
      winner_user_id: winnerId || null,
      payout_category: category,
    };
  });
}

