import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import type { NexusEcosystem, NexusTournament, NexusUpcomingEvent } from '@/lib/nexus/getNexusData';
import { fetchTournamentDirectoryRows } from '@/lib/server/tournamentDirectoryReadModel';
import {
  economicsFromDbCents,
  inferEconomicsFromEventTitle,
  inferTournamentEconomics,
} from '@/lib/nexus/tournamentEconomics';

type Mode = 'active' | 'upcoming';

function roundStatusLine(status: string): string {
  const s = String(status ?? '').toLowerCase().trim();
  if (s === 'active') return 'Round in progress';
  if (s === 'pending') return 'Registration / setup';
  if (s === 'completed') return 'Completed';
  return String(status ?? '—');
}

export async function getUpcomingEvents(
  ecosystem: NexusEcosystem,
  mode: Mode
): Promise<NexusTournament[] | NexusUpcomingEvent[]> {
  const supabase = createServiceRoleClient();
  if (mode === 'active') {
    const dir = await fetchTournamentDirectoryRows({
      ecosystem,
      statusFilter: 'active',
      limit: 50,
    });
    return dir.slice(0, 10).map((r) => {
      const tier = 'Tier B';
      const stage = 'Quarterfinal';
      const start = r.createdAt;
      const feeCents = r.entryFeeCents;
      const poolCents = r.prizePoolCents;
      const recorded =
        typeof feeCents === 'number' || typeof poolCents === 'number'
          ? economicsFromDbCents(
              typeof feeCents === 'number' ? feeCents : null,
              typeof poolCents === 'number' ? poolCents : null,
              ecosystem,
              { lock_utc: start },
            )
          : null;
      const t: NexusTournament = {
        id: r.id,
        name: r.name,
        tier,
        round_status: roundStatusLine(r.status),
        participants: r.participantCount,
        stage,
        start_utc: start,
        economics: recorded ?? inferTournamentEconomics({ tier, participants: r.participantCount, stage, start_utc: start }, ecosystem),
        sponsor_tag: r.sponsorTag,
        sponsor_label: r.sponsorLabel,
      };
      return t;
    });
  }

  const { data: dedicated } = await supabase
    .from('nexus_upcoming_events')
    .select('id,title,event_type,utc_start')
    .eq('ecosystem_scope', ecosystem)
    .eq('is_active', true)
    .gte('utc_start', new Date().toISOString())
    .order('utc_start', { ascending: true })
    .range(0, 9);
  const upcoming = (dedicated ?? []).map((r) => {
    const title = String(r.title ?? 'Event');
    const utc_start = String(r.utc_start ?? new Date().toISOString());
    return {
      id: String(r.id),
      title,
      event_type: String(r.event_type ?? 'System Event'),
      utc_start,
      economics: inferEconomicsFromEventTitle(title, utc_start, ecosystem),
    };
  });

  if (upcoming.length === 0) {
    const utc_start = new Date(Date.now() + 3600_000 * 4).toISOString();
    return [
      {
        id: 'evt-fallback-1',
        title: 'Tier B opens',
        event_type: 'System Event',
        utc_start,
        economics: inferEconomicsFromEventTitle('Tier B opens', utc_start, ecosystem),
      },
    ];
  }
  return upcoming as NexusUpcomingEvent[];
}

