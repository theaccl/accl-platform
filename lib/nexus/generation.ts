import { validateNexusInput, validateNexusOutput, type NexusOutputRecord } from '@/lib/nexus/contract';
import type { NexusAdapterOutput } from '@/lib/nexus/adapters';
import {
  NexusOutputRegistryService,
  type NexusAdvisoryStoredRecord,
  type NexusRegistryQuery,
} from '@/lib/nexus/outputRegistry';

type Obj = Record<string, unknown>;

export type NexusGenerationStats = {
  considered_inputs: number;
  generated: number;
  suppressed: number;
  rejected_inputs: number;
  rejected_outputs: number;
};

export type NexusGenerationResult = {
  stats: NexusGenerationStats;
  generated_records: NexusAdvisoryStoredRecord[];
  suppressed_fingerprints: string[];
  rejected: Array<{ stage: 'input' | 'output'; reason: string; source_id?: string }>;
};

export type NexusGenerationOptions = {
  dedupe_window_seconds?: number;
  now_iso?: string;
};

const DEFAULT_MODEL_VERSION = 'nexus-rules-v1';
const DEFAULT_POLICY_VERSION = 'nexus-policy-1';
const DEFAULT_DEDUPE_WINDOW_SECONDS = 6 * 3600;

function toInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getObj(v: unknown): Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : {};
}

function dedupeFingerprint(output: NexusOutputRecord, subject_id: string | null): string {
  const refs = [...output.source_refs]
    .map((r) => `${r.source_type}:${r.source_id}`)
    .sort()
    .join('|');
  return [
    output.output_type,
    output.subject_scope,
    subject_id ?? '',
    output.content.title.trim().toLowerCase(),
    output.content.summary.trim().toLowerCase(),
    refs,
  ].join('::');
}

function fromStoredFingerprint(row: NexusAdvisoryStoredRecord): string {
  const refs = [...row.source_refs]
    .map((r) => `${r.source_type}:${r.source_id}`)
    .sort()
    .join('|');
  return [
    row.output_type,
    row.subject_scope,
    row.subject_id ?? '',
    row.content.title.trim().toLowerCase(),
    row.content.summary.trim().toLowerCase(),
    refs,
  ].join('::');
}

type Candidate = {
  output: NexusOutputRecord;
  subject_id: string | null;
};

function mkOutput(input: {
  output_type: NexusOutputRecord['output_type'];
  subject_scope: NexusOutputRecord['subject_scope'];
  confidence: number;
  source_refs: NexusOutputRecord['source_refs'];
  title: string;
  summary: string;
  generated_at: string;
  expires_at?: string;
}): NexusOutputRecord {
  return {
    output_type: input.output_type,
    subject_scope: input.subject_scope,
    confidence: input.confidence,
    source_refs: input.source_refs,
    generated_at: input.generated_at,
    model_version: DEFAULT_MODEL_VERSION,
    policy_version: DEFAULT_POLICY_VERSION,
    expires_at: input.expires_at,
    content: {
      title: input.title,
      summary: input.summary,
    },
  };
}

function candidatesForEnvelope(envelope: NexusAdapterOutput['envelope'], nowIso: string): Candidate[] {
  const p = getObj(envelope.payload);
  const refs = [{ source_type: envelope.source_type, source_id: envelope.source_id }] as NexusOutputRecord['source_refs'];
  const out: Candidate[] = [];

  if (envelope.source_type === 'finished_game_artifact') {
    const artifactType = String(p.artifact_type ?? '');
    const gameId = String(p.game_id ?? '').trim() || null;
    if (artifactType === 'placeholder' && gameId) {
      out.push({
        subject_id: gameId,
        output: mkOutput({
          output_type: 'warning',
          subject_scope: 'game',
          confidence: 0.85,
          source_refs: refs,
          title: 'Missing Engine Artifact After Completed Job',
          summary: 'Finished-game artifact set contains placeholder without engine_structured follow-up.',
          generated_at: nowIso,
        }),
      });
    }
  }

  if (envelope.source_type === 'moderation_safe_operational_summary') {
    const queueCounts = getObj(p.queue_counts);
    const staleCounts = getObj(p.stale_counts);

    const failed = toInt(queueCounts.failed);
    const stale = toInt(staleCounts.running_stale) || toInt(queueCounts.stale_running);
    const trainerMissing = toInt(staleCounts.trainer_missing) || toInt(queueCounts.trainer_missing);
    const trainerPartial = toInt(staleCounts.trainer_partial) || toInt(queueCounts.trainer_partial);
    const botNoMoves = toInt(staleCounts.bot_no_moves_logged) || toInt(queueCounts.bot_no_moves_logged);
    const botStaleActive = toInt(staleCounts.bot_stale_active_games) || toInt(queueCounts.bot_stale_active_games);
    const missingEngine = toInt(staleCounts.missing_engine_artifact) || toInt(queueCounts.missing_engine_artifact);

    if (failed > 0) {
      out.push({
        subject_id: 'queue',
        output: mkOutput({
          output_type: 'warning',
          subject_scope: 'system',
          confidence: 0.9,
          source_refs: refs,
          title: 'Queue Failures Detected',
          summary: `${failed} queue job(s) currently failed.`,
          generated_at: nowIso,
        }),
      });
    }
    if (stale > 0) {
      out.push({
        subject_id: 'queue',
        output: mkOutput({
          output_type: 'anomaly_flag',
          subject_scope: 'system',
          confidence: 0.93,
          source_refs: refs,
          title: 'Stale Queue Jobs Detected',
          summary: `${stale} queue job(s) appear stale in running state.`,
          generated_at: nowIso,
        }),
      });
    }
    if (missingEngine > 0) {
      out.push({
        subject_id: 'queue',
        output: mkOutput({
          output_type: 'warning',
          subject_scope: 'system',
          confidence: 0.86,
          source_refs: refs,
          title: 'Missing Engine Artifacts',
          summary: `${missingEngine} completed job(s) missing engine artifacts.`,
          generated_at: nowIso,
        }),
      });
    }
    if (trainerMissing > 0 || trainerPartial > 0) {
      const total = trainerMissing + trainerPartial;
      out.push({
        subject_id: 'trainer',
        output: mkOutput({
          output_type: trainerMissing > 0 ? 'warning' : 'recommendation',
          subject_scope: 'system',
          confidence: 0.82,
          source_refs: refs,
          title: 'Trainer Generation Degradation',
          summary: `${total} trainer generation outcome(s) are missing or partial.`,
          generated_at: nowIso,
        }),
      });
    }
    if (botNoMoves > 0 || botStaleActive > 0) {
      const total = botNoMoves + botStaleActive;
      out.push({
        subject_id: 'bot',
        output: mkOutput({
          output_type: 'anomaly_flag',
          subject_scope: 'system',
          confidence: 0.9,
          source_refs: refs,
          title: 'Bot Activity Anomalies',
          summary: `${total} bot anomaly signal(s): no-move logs and/or stale active bot games.`,
          generated_at: nowIso,
        }),
      });
    }
  }

  if (envelope.source_type === 'config_env_health_state') {
    const hasErrors = Boolean(p.has_errors);
    if (hasErrors) {
      out.push({
        subject_id: 'config',
        output: mkOutput({
          output_type: 'anomaly_flag',
          subject_scope: 'system',
          confidence: 0.96,
          source_refs: refs,
          title: 'Config Health Degradation',
          summary: 'Environment or provisioning validation reports configuration errors.',
          generated_at: nowIso,
        }),
      });
    } else {
      out.push({
        subject_id: 'config',
        output: mkOutput({
          output_type: 'insight',
          subject_scope: 'system',
          confidence: 0.75,
          source_refs: refs,
          title: 'Config Health Stable',
          summary: 'Environment and provisioning checks are currently healthy.',
          generated_at: nowIso,
          expires_at: new Date(Date.parse(nowIso) + 2 * 3600 * 1000).toISOString(),
        }),
      });
    }
  }

  return out;
}

async function getRecentForDedupe(
  registry: NexusOutputRegistryService,
  candidate: Candidate,
  generatedAfterIso: string
): Promise<NexusAdvisoryStoredRecord[]> {
  const filter: NexusRegistryQuery = {
    subject_scope: candidate.output.subject_scope,
    output_type: candidate.output.output_type,
    generated_after: generatedAfterIso,
    limit: 200,
  };
  if (candidate.subject_id) filter.subject_id = candidate.subject_id;
  return registry.query(filter);
}

export async function runNexusAdvisoryGeneration(input: {
  adapter_inputs: NexusAdapterOutput[];
  registry: NexusOutputRegistryService;
  options?: NexusGenerationOptions;
}): Promise<NexusGenerationResult> {
  const dedupeWindow = Math.max(60, input.options?.dedupe_window_seconds ?? DEFAULT_DEDUPE_WINDOW_SECONDS);
  const nowIso = input.options?.now_iso ?? new Date().toISOString();
  const windowStartIso = new Date(Date.parse(nowIso) - dedupeWindow * 1000).toISOString();

  const result: NexusGenerationResult = {
    stats: {
      considered_inputs: input.adapter_inputs.length,
      generated: 0,
      suppressed: 0,
      rejected_inputs: 0,
      rejected_outputs: 0,
    },
    generated_records: [],
    suppressed_fingerprints: [],
    rejected: [],
  };

  for (const adapterInput of input.adapter_inputs) {
    const validInput = validateNexusInput(adapterInput.envelope);
    if (!validInput.ok) {
      result.stats.rejected_inputs += 1;
      result.rejected.push({
        stage: 'input',
        source_id: adapterInput.envelope.source_id,
        reason: validInput.errors.map((e) => `${e.category}:${e.message}`).join('; '),
      });
      continue;
    }

    const candidates = candidatesForEnvelope(validInput.value, nowIso);
    for (const candidate of candidates) {
      const outputValid = validateNexusOutput(candidate.output);
      if (!outputValid.ok) {
        result.stats.rejected_outputs += 1;
        result.rejected.push({
          stage: 'output',
          source_id: adapterInput.envelope.source_id,
          reason: outputValid.errors.map((e) => `${e.category}:${e.message}`).join('; '),
        });
        continue;
      }

      const fp = dedupeFingerprint(outputValid.value, candidate.subject_id);
      const recent = await getRecentForDedupe(input.registry, candidate, windowStartIso);
      const duplicate = recent.some((r) => fromStoredFingerprint(r) === fp);
      if (duplicate) {
        result.stats.suppressed += 1;
        result.suppressed_fingerprints.push(fp);
        continue;
      }

      const stored = await input.registry.writeAdvisoryRecord({
        output: outputValid.value,
        subject_id: candidate.subject_id,
      });
      result.generated_records.push(stored);
      result.stats.generated += 1;
    }
  }

  return result;
}

