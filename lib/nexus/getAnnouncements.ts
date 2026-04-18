import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import type { NexusAnnouncement, NexusEcosystem } from '@/lib/nexus/getNexusData';

export async function getAnnouncements(ecosystem: NexusEcosystem): Promise<NexusAnnouncement[]> {
  const supabase = createServiceRoleClient();
  const { data: curated } = await supabase
    .from('nexus_announcements')
    .select('id,title,body,created_at')
    .eq('ecosystem_scope', ecosystem)
    .eq('is_active', true)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .range(0, 11);
  if ((curated ?? []).length > 0) {
    return (curated ?? []).map((a) => ({
      id: String(a.id),
      title: String(a.title ?? 'Announcement'),
      body: String(a.body ?? ''),
      utc: String(a.created_at ?? new Date().toISOString()),
    }));
  }

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id,name,status,created_at')
    .eq('ecosystem_scope', ecosystem)
    .order('created_at', { ascending: false })
    .limit(8);
  const items = (tournaments ?? []).map((t) => ({
    id: `ann-${String(t.id)}`,
    title: String(t.name ?? 'Tournament update'),
    body: `Status: ${String(t.status ?? 'active')}`,
    utc: String((t as { created_at?: string }).created_at ?? new Date().toISOString()),
  }));
  if (items.length > 0) return items;
  return [
    {
      id: 'ann-fallback-1',
      title: 'Season finals announced',
      body: 'Bracket starts tonight. Confirm your entries.',
      utc: new Date().toISOString(),
    },
  ];
}

