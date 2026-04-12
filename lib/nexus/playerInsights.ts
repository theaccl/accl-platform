import type { NexusAdvisoryStoredRecord } from '@/lib/nexus/outputRegistry';
import { rankAndDedupeAdvisories } from '@/lib/nexus/presentation';

export type PlayerInsightType = 'insight' | 'recommendation' | 'warning';

export type PlayerSafeInsight = {
  id: string;
  output_type: PlayerInsightType;
  title: string;
  summary: string;
  confidence: number;
  generated_at: string;
  quality_score: number;
  display_priority: number;
};

const ALLOWED_TYPES: PlayerInsightType[] = ['insight', 'recommendation', 'warning'];

const FORBIDDEN_TERMS = [
  'fen',
  'bestmove',
  'pv',
  'uci',
  'moves',
  'move_list',
  'active game',
  'active_game',
  'in_progress',
  'live game',
  'live_game',
  'ongoing game',
  'ongoing_game',
  'tournament protected',
  'tournament_protected',
  'protected tournament',
  'protected_tournament',
];

function asLowerJson(value: unknown): string {
  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return '';
  }
}

function hasForbiddenContent(record: NexusAdvisoryStoredRecord): boolean {
  const blob = `${asLowerJson(record.content)} ${asLowerJson(record.source_refs)}`;
  return FORBIDDEN_TERMS.some((t) => blob.includes(t));
}

export function sanitizePlayerInsights(input: {
  rows: NexusAdvisoryStoredRecord[];
  current_user_id: string;
  now_ms?: number;
  limit?: number;
}): PlayerSafeInsight[] {
  const now = input.now_ms ?? Date.now();
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const scoped = input.rows.filter((r) => r.subject_scope === 'player' && r.subject_id === input.current_user_id);
  const typed = scoped.filter((r) => ALLOWED_TYPES.includes(r.output_type as PlayerInsightType));
  const safe = typed.filter((r) => !hasForbiddenContent(r));
  const prioritized = rankAndDedupeAdvisories({
    rows: safe,
    now_ms: now,
    keep_expired: false,
    keep_stale_active: false,
    stale_after_hours: 96,
    dedupe_window_hours: 96,
  });

  return prioritized
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      output_type: r.output_type as PlayerInsightType,
      title: r.content.title,
      summary: r.content.summary,
      confidence: r.confidence,
      generated_at: r.generated_at,
      quality_score: r.quality_score,
      display_priority: r.display_priority,
    }));
}

