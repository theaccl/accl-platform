import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import type { NexusEcosystem } from '@/lib/nexus/getNexusData';

/**
 * Derived engagement counts — no synthetic numbers (DB counts + standings length).
 */
export async function countGamesUpdatedToday(ecosystem: NexusEcosystem): Promise<number> {
  const supabase = createServiceRoleClient();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('ecosystem_scope', ecosystem)
    .gte('updated_at', start.toISOString());
  if (error) return 0;
  return count ?? 0;
}
