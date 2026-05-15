/**
 * Trusted tournament directory — service-role reads with an explicit safe column allow-list.
 * Does not change RLS. Call only from server routes / RSC / route handlers.
 *
 * Detail access model (product):
 * - Anonymous: adult ecosystem only via /api/tournaments/directory (K-12 requires auth there).
 * - Authenticated: adult + k12 directory listings (metadata only — no bracket, no created_by).
 * - Entrants/creators: existing /tournaments/[id] + RLS for full rows; not replaced here.
 * - Operators: unchanged internal routes + service_role.
 */

import type { NexusEcosystem } from '@/lib/nexus/getNexusData';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

export type TournamentDirectoryStatusFilter = 'active' | 'pending' | 'completed' | 'all';

export type TournamentDirectoryRow = {
  id: string;
  name: string;
  format: string;
  ecosystemScope: NexusEcosystem;
  status: string;
  tempo: string | null;
  rated: boolean;
  liveTimeControl: string | null;
  createdAt: string;
  participantCount: number;
  sponsorLabel: string | null;
  sponsorTag: string | null;
  entryFeeCents: number | null;
  prizePoolCents: number | null;
};

type TournamentRowDb = {
  id: string;
  name: string;
  format: string;
  ecosystem_scope: string;
  status: string;
  tempo: string | null;
  rated: boolean | null;
  live_time_control: string | null;
  created_at: string;
  sponsor_label?: string | null;
  sponsor_tag?: string | null;
  entry_fee_cents?: number | null;
  prize_pool_cents?: number | null;
};

function asEcosystem(raw: string | null | undefined): NexusEcosystem | null {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'k12') return 'k12';
  if (s === 'adult') return 'adult';
  return null;
}

function normalizeDirectoryRow(r: TournamentRowDb, participantCount: number): TournamentDirectoryRow | null {
  const eco = asEcosystem(r.ecosystem_scope);
  if (!eco) return null;
  return {
    id: String(r.id ?? '').trim(),
    name: String(r.name ?? 'Tournament').trim() || 'Tournament',
    format: String(r.format ?? 'single_elimination').trim() || 'single_elimination',
    ecosystemScope: eco,
    status: String(r.status ?? '').trim() || 'pending',
    tempo: r.tempo != null ? String(r.tempo) : null,
    rated: r.rated === true,
    liveTimeControl: r.live_time_control != null ? String(r.live_time_control) : null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    participantCount,
    sponsorLabel:
      r.sponsor_label != null && String(r.sponsor_label).trim() ? String(r.sponsor_label).trim() : null,
    sponsorTag: r.sponsor_tag != null && String(r.sponsor_tag).trim() ? String(r.sponsor_tag).trim() : null,
    entryFeeCents: typeof r.entry_fee_cents === 'number' ? r.entry_fee_cents : null,
    prizePoolCents: typeof r.prize_pool_cents === 'number' ? r.prize_pool_cents : null,
  };
}

async function fetchParticipantCounts(
  supabase: ReturnType<typeof createServiceRoleClient>,
  tournamentIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (tournamentIds.length === 0) return counts;
  const { data, error } = await supabase.from('tournament_entries').select('tournament_id').in('tournament_id', tournamentIds);
  if (error || !data) return counts;
  for (const row of data as { tournament_id: string }[]) {
    const tid = String(row.tournament_id ?? '').trim();
    if (!tid) continue;
    counts.set(tid, (counts.get(tid) ?? 0) + 1);
  }
  return counts;
}

export type FetchTournamentDirectoryParams = {
  ecosystem: NexusEcosystem;
  statusFilter: TournamentDirectoryStatusFilter;
  /** Hard cap per query */
  limit: number;
};

/**
 * Curated tournament discovery rows for the given ecosystem (never cross-leaks scopes).
 */
export async function fetchTournamentDirectoryRows(params: FetchTournamentDirectoryParams): Promise<TournamentDirectoryRow[]> {
  const cap = Math.min(Math.max(params.limit, 1), 100);
  const supabase = createServiceRoleClient();

  let q = supabase
    .from('tournaments')
    .select(
      'id,name,format,ecosystem_scope,status,tempo,rated,live_time_control,created_at,sponsor_label,sponsor_tag,entry_fee_cents,prize_pool_cents',
    )
    .eq('ecosystem_scope', params.ecosystem)
    .order('created_at', { ascending: false })
    .limit(cap);

  if (params.statusFilter !== 'all') {
    q = q.eq('status', params.statusFilter);
  }

  const { data, error } = await q;
  if (error || !data?.length) return [];

  const rows = data as TournamentRowDb[];
  const ids = rows.map((r) => String(r.id)).filter(Boolean);
  const countMap = await fetchParticipantCounts(supabase, ids);

  const out: TournamentDirectoryRow[] = [];
  for (const r of rows) {
    const pc = countMap.get(String(r.id)) ?? 0;
    const normalized = normalizeDirectoryRow(r, pc);
    if (normalized) out.push(normalized);
  }
  return out;
}
