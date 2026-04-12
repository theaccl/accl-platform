import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import type { NexusActivityItem, NexusEcosystem } from '@/lib/nexus/getNexusData';

export async function getActivityFeed(ecosystem: NexusEcosystem): Promise<NexusActivityItem[]> {
  const supabase = createServiceRoleClient();
  const [gamesRes, jobsRes, tournamentRes, noticeRes] = await Promise.all([
    supabase
      .from('games')
      .select('id,status,updated_at,result,end_reason')
      .eq('ecosystem_scope', ecosystem)
      .order('updated_at', { ascending: false })
      .limit(40),
    supabase
      .from('finished_game_analysis_jobs')
      .select('id,status,updated_at,game_id')
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('tournaments')
      .select('id,name,status,updated_at')
      .eq('ecosystem_scope', ecosystem)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('nexus_announcements')
      .select('id,title,created_at,is_active')
      .eq('ecosystem_scope', ecosystem)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const gameItems: NexusActivityItem[] = (gamesRes.data ?? [])
    .filter((g) => ['active', 'finished'].includes(String(g.status ?? '').toLowerCase()))
    .map((g) => ({
      id: `g-${String(g.id)}`,
      kind: 'game',
      message:
        String(g.status) === 'finished'
          ? `Winner recorded (${String(g.result ?? 'result')})`
          : `Live game status update (${String(g.status)})`,
      utc: String(g.updated_at ?? new Date().toISOString()),
      game_id: String(g.id),
    }));

  const jobItems: NexusActivityItem[] = (jobsRes.data ?? [])
    .filter((j) => ['completed', 'failed'].includes(String(j.status ?? '').toLowerCase()))
    .map((j) => ({
    id: `q-${String(j.id)}`,
    kind: 'analysis',
    message: `Analysis job ${String(j.status)} for game ${String(j.game_id).slice(0, 6)}`,
    utc: String(j.updated_at ?? new Date().toISOString()),
    }));

  const tournamentItems: NexusActivityItem[] = (tournamentRes.data ?? []).map((t) => ({
    id: `t-${String(t.id)}`,
    kind: 'tournament',
    message: `${String(t.name ?? 'Tournament')} is ${String(t.status ?? 'updated')}`,
    utc: String(t.updated_at ?? new Date().toISOString()),
  }));

  const noticeItems: NexusActivityItem[] = (noticeRes.data ?? []).map((n) => ({
    id: `n-${String(n.id)}`,
    kind: 'announcement',
    message: `Announcement: ${String(n.title ?? 'System update')}`,
    utc: String(n.created_at ?? new Date().toISOString()),
  }));

  const byFingerprint = new Set<string>();
  const deduped = [...gameItems, ...jobItems, ...tournamentItems, ...noticeItems]
    .sort((a, b) => Date.parse(b.utc) - Date.parse(a.utc))
    .filter((item) => {
      const fp = `${item.kind}:${item.message}`;
      if (byFingerprint.has(fp)) return false;
      byFingerprint.add(fp);
      return true;
    });

  return deduped.slice(0, 60);
}

