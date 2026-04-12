import type { SupabaseClient } from '@supabase/supabase-js';

export type AntiCheatSignalCounts = Partial<{
  confirmedOverlap: number;
  noveltyCollision: number;
  protectedOverlapAttempt: number;
  blockedLiveProtectedRequest: number;
  blockedRequest: number;
  probingBurst: number;
  openingBookOverlap: number;
}>;

export type AntiCheatEventRecord = {
  id: string;
  user_id: string;
  game_id: string | null;
  fen: string | null;
  overlap_verdict: string;
  suspicion_score: number;
  suspicion_tier: string;
  reasons_json: unknown;
  protected_context: boolean;
  engine_called: boolean;
  request_context: unknown;
  created_at: string;
};

export type AntiCheatEventInsert = Omit<AntiCheatEventRecord, 'id' | 'created_at'>;

export type SuspicionTrend = {
  latest: number;
  oldest: number;
  average: number;
  delta: number;
};

export interface AntiCheatEventStore {
  appendEvent(event: AntiCheatEventInsert): Promise<void>;
  listRecentEventsByUser(userId: string, limit: number): Promise<AntiCheatEventRecord[]>;
  countRecentSignalsByUser(userId: string, sinceIso: string): Promise<AntiCheatSignalCounts>;
  computeRollingSuspicionTrendByUser(userId: string, limit: number): Promise<SuspicionTrend>;
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(200, Math.max(1, Math.floor(limit)));
}

function parseReasonsProbeBurst(reasonsJson: unknown): number {
  if (!Array.isArray(reasonsJson)) return 0;
  let peak = 0;
  for (const r of reasonsJson) {
    if (!r || typeof r !== 'object') continue;
    const maybe = r as { signal?: unknown; occurrences?: unknown };
    if (maybe.signal !== 'repeated_probing') continue;
    const occurrences =
      typeof maybe.occurrences === 'number'
        ? maybe.occurrences
        : Number.parseInt(String(maybe.occurrences ?? '0'), 10);
    if (Number.isFinite(occurrences)) peak = Math.max(peak, occurrences);
  }
  return peak;
}

export function deriveSignalCountsFromEvents(events: AntiCheatEventRecord[]): AntiCheatSignalCounts {
  const counts: Required<AntiCheatSignalCounts> = {
    confirmedOverlap: 0,
    noveltyCollision: 0,
    protectedOverlapAttempt: 0,
    blockedLiveProtectedRequest: 0,
    blockedRequest: 0,
    probingBurst: 0,
    openingBookOverlap: 0,
  };

  for (const event of events) {
    const verdict = String(event.overlap_verdict ?? 'CLEAR');
    if (verdict === 'CONFIRMED_OVERLAP') counts.confirmedOverlap += 1;
    if (verdict === 'NOVELTY_COLLISION') counts.noveltyCollision += 1;
    if (verdict === 'BOOK_OVERLAP') counts.openingBookOverlap += 1;

    if (event.protected_context && verdict !== 'CLEAR') counts.protectedOverlapAttempt += 1;
    if (event.protected_context && verdict === 'CONFIRMED_OVERLAP') {
      counts.blockedLiveProtectedRequest += 1;
    }
    if (event.engine_called === false) counts.blockedRequest += 1;

    counts.probingBurst = Math.max(counts.probingBurst, parseReasonsProbeBurst(event.reasons_json));
  }

  return counts;
}

function emptyTrend(): SuspicionTrend {
  return { latest: 0, oldest: 0, average: 0, delta: 0 };
}

export function computeSuspicionTrend(events: AntiCheatEventRecord[]): SuspicionTrend {
  if (events.length === 0) return emptyTrend();
  const ordered = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const scores = ordered.map((e) => Number(e.suspicion_score) || 0);
  const oldest = scores[0] ?? 0;
  const latest = scores[scores.length - 1] ?? 0;
  const average = scores.reduce((acc, n) => acc + n, 0) / scores.length;
  return {
    latest,
    oldest,
    average,
    delta: latest - oldest,
  };
}

export class SupabaseAntiCheatEventStore implements AntiCheatEventStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async appendEvent(event: AntiCheatEventInsert): Promise<void> {
    const { error } = await this.supabase.from('anti_cheat_events').insert(event);
    if (error) throw new Error(error.message);
  }

  async listRecentEventsByUser(userId: string, limit: number): Promise<AntiCheatEventRecord[]> {
    const { data, error } = await this.supabase
      .from('anti_cheat_events')
      .select(
        'id,user_id,game_id,fen,overlap_verdict,suspicion_score,suspicion_tier,reasons_json,protected_context,engine_called,request_context,created_at'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(clampLimit(limit));
    if (error) throw new Error(error.message);
    return (data ?? []) as AntiCheatEventRecord[];
  }

  async countRecentSignalsByUser(userId: string, sinceIso: string): Promise<AntiCheatSignalCounts> {
    const { data, error } = await this.supabase
      .from('anti_cheat_events')
      .select(
        'id,user_id,game_id,fen,overlap_verdict,suspicion_score,suspicion_tier,reasons_json,protected_context,engine_called,request_context,created_at'
      )
      .eq('user_id', userId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return deriveSignalCountsFromEvents((data ?? []) as AntiCheatEventRecord[]);
  }

  async computeRollingSuspicionTrendByUser(userId: string, limit: number): Promise<SuspicionTrend> {
    const events = await this.listRecentEventsByUser(userId, limit);
    return computeSuspicionTrend(events);
  }
}

export class InMemoryAntiCheatEventStore implements AntiCheatEventStore {
  private rows: AntiCheatEventRecord[] = [];

  async appendEvent(event: AntiCheatEventInsert): Promise<void> {
    this.rows.push({
      ...event,
      id: `evt_${this.rows.length + 1}`,
      created_at: new Date().toISOString(),
    });
  }

  async listRecentEventsByUser(userId: string, limit: number): Promise<AntiCheatEventRecord[]> {
    return this.rows
      .filter((r) => r.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, clampLimit(limit));
  }

  async countRecentSignalsByUser(userId: string, sinceIso: string): Promise<AntiCheatSignalCounts> {
    const events = this.rows.filter((r) => r.user_id === userId && r.created_at >= sinceIso);
    return deriveSignalCountsFromEvents(events);
  }

  async computeRollingSuspicionTrendByUser(userId: string, limit: number): Promise<SuspicionTrend> {
    const events = await this.listRecentEventsByUser(userId, limit);
    return computeSuspicionTrend(events);
  }
}
