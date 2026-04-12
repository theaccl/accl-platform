import type { NexusOutputType } from '@/lib/nexus/contract';
import type { NexusAdvisoryStoredRecord } from '@/lib/nexus/outputRegistry';

export type AdvisoryPresentationStatus = 'active' | 'expired' | 'stale_active';

export type RankedAdvisory = NexusAdvisoryStoredRecord & {
  presentation_status: AdvisoryPresentationStatus;
  quality_score: number;
  display_priority: number;
  dedupe_key: string;
};

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeKey(row: NexusAdvisoryStoredRecord): string {
  const title = normalizeText(row.content.title);
  const summary = normalizeText(row.content.summary);
  return `${row.output_type}|${row.subject_scope}|${row.subject_id ?? 'none'}|${title}|${summary}`;
}

function typeWeight(outputType: NexusOutputType): number {
  if (outputType === 'anomaly_flag') return 0.45;
  if (outputType === 'warning') return 0.35;
  if (outputType === 'recommendation') return 0.25;
  return 0.15;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function rankAndDedupeAdvisories(input: {
  rows: NexusAdvisoryStoredRecord[];
  now_ms?: number;
  stale_after_hours?: number;
  dedupe_window_hours?: number;
  keep_expired?: boolean;
  keep_stale_active?: boolean;
}): RankedAdvisory[] {
  const now = input.now_ms ?? Date.now();
  const staleAfterMs = Math.max(1, input.stale_after_hours ?? 72) * 3600 * 1000;
  const dedupeWindowMs = Math.max(1, input.dedupe_window_hours ?? 72) * 3600 * 1000;
  const keepExpired = Boolean(input.keep_expired);
  const keepStaleActive = input.keep_stale_active ?? true;

  const scored = input.rows.map((row) => {
    const generatedMs = Date.parse(row.generated_at);
    const ageMs = Number.isFinite(generatedMs) ? Math.max(0, now - generatedMs) : Number.MAX_SAFE_INTEGER;
    const expired = Boolean(row.expires_at) && Date.parse(String(row.expires_at)) <= now;
    const stale = !expired && ageMs >= staleAfterMs;
    const freshness = 1 - clamp01(ageMs / (7 * 24 * 3600 * 1000));
    const quality = clamp01(typeWeight(row.output_type) + clamp01(row.confidence) * 0.45 + freshness * 0.2);
    const status: AdvisoryPresentationStatus = expired ? 'expired' : stale ? 'stale_active' : 'active';
    const priority = Math.round(quality * 1000) + (status === 'active' ? 100 : status === 'stale_active' ? 25 : 0);
    return {
      ...row,
      presentation_status: status,
      quality_score: quality,
      display_priority: priority,
      dedupe_key: dedupeKey(row),
    };
  });

  const filtered = scored.filter((row) => {
    if (row.presentation_status === 'expired' && !keepExpired) return false;
    if (row.presentation_status === 'stale_active' && !keepStaleActive) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (b.display_priority !== a.display_priority) return b.display_priority - a.display_priority;
    return Date.parse(b.generated_at) - Date.parse(a.generated_at);
  });

  const accepted: RankedAdvisory[] = [];
  const acceptedByKey = new Map<string, number>();
  for (const row of filtered) {
    const generatedMs = Date.parse(row.generated_at);
    const prevMs = acceptedByKey.get(row.dedupe_key);
    if (prevMs != null && Math.abs(prevMs - generatedMs) <= dedupeWindowMs) {
      continue;
    }
    acceptedByKey.set(row.dedupe_key, generatedMs);
    accepted.push(row);
  }

  return accepted;
}

