import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import type { NexusEcosystem, NexusTournament, NexusUpcomingEvent } from '@/lib/nexus/getNexusData';
import {
  economicsFromDbCents,
  inferEconomicsFromEventTitle,
  inferTournamentEconomics,
} from '@/lib/nexus/tournamentEconomics';

type Mode = 'active' | 'upcoming';

export async function getUpcomingEvents(
  ecosystem: NexusEcosystem,
  mode: Mode
): Promise<NexusTournament[] | NexusUpcomingEvent[]> {
  const supabase = createServiceRoleClient();
  if (mode === 'active') {
    const { data } = await supabase
      .from('tournaments')
      .select('id,name,status,created_at,sponsor_tag,sponsor_label,entry_fee_cents,prize_pool_cents')
      .eq('ecosystem_scope', ecosystem)
      .order('created_at', { ascending: false })
      .limit(50);
    const active = (data ?? []).filter((r) => ['active', 'in_progress', 'live'].includes(String(r.status ?? '').toLowerCase()));
    return active.slice(0, 10).map((r) => {
      const tier = 'Tier B';
      const participants = 16;
      const stage = 'Quarterfinal';
      const start = String(r.created_at ?? null);
      const feeCents = (r as { entry_fee_cents?: number | null }).entry_fee_cents;
      const poolCents = (r as { prize_pool_cents?: number | null }).prize_pool_cents;
      const recorded =
        typeof feeCents === 'number' || typeof poolCents === 'number'
          ? economicsFromDbCents(
              typeof feeCents === 'number' ? feeCents : null,
              typeof poolCents === 'number' ? poolCents : null,
              ecosystem,
              { lock_utc: start }
            )
          : null;
      const t: NexusTournament = {
        id: String(r.id),
        name: String(r.name ?? 'Tournament'),
        tier,
        round_status: 'Round in progress',
        participants,
        stage,
        start_utc: start,
        economics: recorded ?? inferTournamentEconomics({ tier, participants, stage, start_utc: start }, ecosystem),
        sponsor_tag: (r as { sponsor_tag?: string | null }).sponsor_tag ?? null,
        sponsor_label: (r as { sponsor_label?: string | null }).sponsor_label ?? null,
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

