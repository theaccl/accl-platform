export type NexusOutputType = 'insight' | 'warning' | 'recommendation' | 'anomaly_flag';

export type NexusSubjectScope = 'player' | 'game' | 'system' | 'moderation';

export type NexusAllowedInputType =
  | 'finished_game_artifact'
  | 'trainer_approved_output'
  | 'player_pattern_profile'
  | 'moderation_safe_operational_summary'
  | 'tournament_safety_metadata'
  | 'config_env_health_state';

export type NexusSourceRef = {
  source_type: NexusAllowedInputType;
  source_id: string;
};

export type NexusOutputRecord = {
  output_type: NexusOutputType;
  subject_scope: NexusSubjectScope;
  confidence: number;
  source_refs: NexusSourceRef[];
  generated_at: string;
  model_version: string;
  policy_version: string;
  expires_at?: string;
  content: {
    title: string;
    summary: string;
  };
};

export type NexusInputEnvelope = {
  source_type: NexusAllowedInputType;
  source_id: string;
  payload: Record<string, unknown>;
};

export type NexusValidationErrorCategory =
  | 'forbidden_input'
  | 'forbidden_output'
  | 'schema_error'
  | 'missing_required';

export type NexusValidationError = {
  category: NexusValidationErrorCategory;
  message: string;
};

export type NexusValidationResult<T> = { ok: true; value: T } | { ok: false; errors: NexusValidationError[] };

const ALLOWED_INPUTS = new Set<NexusAllowedInputType>([
  'finished_game_artifact',
  'trainer_approved_output',
  'player_pattern_profile',
  'moderation_safe_operational_summary',
  'tournament_safety_metadata',
  'config_env_health_state',
]);

const OUTPUT_TYPES = new Set<NexusOutputType>(['insight', 'warning', 'recommendation', 'anomaly_flag']);
const SUBJECT_SCOPES = new Set<NexusSubjectScope>(['player', 'game', 'system', 'moderation']);

const FORBIDDEN_INPUT_KEYWORDS = [
  'access_token',
  'refresh_token',
  'authorization',
  'session',
  'password',
  'service_role_key',
  'anon_key',
  'secret',
  'api_key',
  'raw_moderation_evidence',
  'protected_position',
  'active_tournament_position',
];

const FORBIDDEN_OUTPUT_KEYS = [
  'authoritative_action',
  'sanction_action',
  'enforcement_write',
  'mutation',
  'free_text_action',
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isIsoDate(value: string): boolean {
  const t = Date.parse(value);
  return Number.isFinite(t);
}

function containsForbiddenKeyword(obj: unknown, keywords: string[]): boolean {
  if (obj == null) return false;
  if (Array.isArray(obj)) return obj.some((v) => containsForbiddenKeyword(v, keywords));
  if (!isRecord(obj)) return false;

  for (const [k, v] of Object.entries(obj)) {
    const kl = k.toLowerCase();
    if (keywords.some((word) => kl.includes(word))) return true;
    if (typeof v === 'string') {
      const vl = v.toLowerCase();
      if (keywords.some((word) => vl.includes(word))) return true;
    }
    if (containsForbiddenKeyword(v, keywords)) return true;
  }
  return false;
}

function hasTournamentPositionLeak(payload: Record<string, unknown>): boolean {
  if (containsForbiddenKeyword(payload, ['fen', 'pv', 'bestmove', 'uci', 'position'])) return true;
  return false;
}

function hasLiveMutationPath(payload: Record<string, unknown>): boolean {
  const serialized = JSON.stringify(payload).toLowerCase();
  return (
    serialized.includes('/api/game/submit-move') ||
    serialized.includes('finish_game') ||
    serialized.includes('update games set') ||
    serialized.includes('authoritative mutation')
  );
}

export function validateNexusInput(input: unknown): NexusValidationResult<NexusInputEnvelope> {
  const errors: NexusValidationError[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: [{ category: 'schema_error', message: 'input must be an object' }] };
  }

  const sourceType = String(input.source_type ?? '');
  const sourceId = String(input.source_id ?? '');
  const payload = input.payload;

  if (!sourceType) errors.push({ category: 'missing_required', message: 'source_type required' });
  if (!sourceId) errors.push({ category: 'missing_required', message: 'source_id required' });
  if (!isRecord(payload)) errors.push({ category: 'schema_error', message: 'payload must be an object' });

  if (errors.length > 0) return { ok: false, errors };
  const payloadObj = payload as Record<string, unknown>;

  if (!ALLOWED_INPUTS.has(sourceType as NexusAllowedInputType)) {
    return { ok: false, errors: [{ category: 'forbidden_input', message: `source_type not allowed: ${sourceType}` }] };
  }

  if (containsForbiddenKeyword(payloadObj, FORBIDDEN_INPUT_KEYWORDS)) {
    return { ok: false, errors: [{ category: 'forbidden_input', message: 'payload contains forbidden sensitive or unsafe fields' }] };
  }

  if (sourceType === 'tournament_safety_metadata' && hasTournamentPositionLeak(payloadObj)) {
    return {
      ok: false,
      errors: [{ category: 'forbidden_input', message: 'tournament_safety_metadata cannot contain protected position data' }],
    };
  }

  if (hasLiveMutationPath(payloadObj)) {
    return {
      ok: false,
      errors: [{ category: 'forbidden_input', message: 'payload references live authoritative mutation paths' }],
    };
  }

  return {
    ok: true,
    value: {
      source_type: sourceType as NexusAllowedInputType,
      source_id: sourceId,
      payload: payloadObj,
    },
  };
}

export function validateNexusOutput(output: unknown): NexusValidationResult<NexusOutputRecord> {
  const errors: NexusValidationError[] = [];
  if (!isRecord(output)) {
    return { ok: false, errors: [{ category: 'schema_error', message: 'output must be an object' }] };
  }

  if (containsForbiddenKeyword(output, FORBIDDEN_OUTPUT_KEYS)) {
    return { ok: false, errors: [{ category: 'forbidden_output', message: 'output contains forbidden action fields' }] };
  }

  const outputType = String(output.output_type ?? '');
  const scope = String(output.subject_scope ?? '');
  const confidence = Number(output.confidence);
  const generatedAt = String(output.generated_at ?? '');
  const modelVersion = String(output.model_version ?? '');
  const policyVersion = String(output.policy_version ?? '');
  const expiresAt = output.expires_at == null ? undefined : String(output.expires_at);
  const sourceRefs = output.source_refs;
  const content = output.content;

  if (!OUTPUT_TYPES.has(outputType as NexusOutputType)) {
    errors.push({ category: 'schema_error', message: `invalid output_type: ${outputType}` });
  }
  if (!SUBJECT_SCOPES.has(scope as NexusSubjectScope)) {
    errors.push({ category: 'schema_error', message: `invalid subject_scope: ${scope}` });
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    errors.push({ category: 'schema_error', message: 'confidence must be between 0 and 1' });
  }
  if (!generatedAt || !isIsoDate(generatedAt)) {
    errors.push({ category: 'schema_error', message: 'generated_at must be valid ISO datetime' });
  }
  if (!modelVersion) errors.push({ category: 'missing_required', message: 'model_version required' });
  if (!policyVersion) errors.push({ category: 'missing_required', message: 'policy_version required' });
  if (expiresAt && !isIsoDate(expiresAt)) {
    errors.push({ category: 'schema_error', message: 'expires_at must be valid ISO datetime when provided' });
  }
  if (expiresAt && isIsoDate(generatedAt) && Date.parse(expiresAt) <= Date.parse(generatedAt)) {
    errors.push({ category: 'schema_error', message: 'expires_at must be later than generated_at' });
  }

  if (!Array.isArray(sourceRefs) || sourceRefs.length === 0) {
    errors.push({ category: 'missing_required', message: 'source_refs must be non-empty' });
  } else {
    sourceRefs.forEach((ref, idx) => {
      if (!isRecord(ref)) {
        errors.push({ category: 'schema_error', message: `source_refs[${idx}] must be object` });
        return;
      }
      const refType = String(ref.source_type ?? '');
      const refId = String(ref.source_id ?? '');
      if (!ALLOWED_INPUTS.has(refType as NexusAllowedInputType)) {
        errors.push({ category: 'forbidden_output', message: `source_refs[${idx}] source_type not allowlisted` });
      }
      if (!refId) errors.push({ category: 'missing_required', message: `source_refs[${idx}] source_id required` });
    });
  }

  if (!isRecord(content)) {
    errors.push({ category: 'missing_required', message: 'content object required' });
  } else {
    const title = String(content.title ?? '').trim();
    const summary = String(content.summary ?? '').trim();
    if (!title || !summary) {
      errors.push({ category: 'missing_required', message: 'content.title and content.summary required' });
    }
    if (/ban|suspend|enforce|penalty|sanction/i.test(`${title} ${summary}`)) {
      errors.push({ category: 'forbidden_output', message: 'content must not issue sanctions/enforcement writes' });
    }
    if (/fen|bestmove|uci|pv\s/i.test(`${title} ${summary}`)) {
      errors.push({ category: 'forbidden_output', message: 'content must not disclose protected position details' });
    }
    if (/\/api\/game\/submit-move|finish_game|update\s+games\s+set/i.test(`${title} ${summary}`)) {
      errors.push({ category: 'forbidden_output', message: 'content must not reference authoritative mutation paths' });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      output_type: outputType as NexusOutputType,
      subject_scope: scope as NexusSubjectScope,
      confidence,
      source_refs: sourceRefs as NexusSourceRef[],
      generated_at: generatedAt,
      model_version: modelVersion,
      policy_version: policyVersion,
      expires_at: expiresAt,
      content: content as { title: string; summary: string },
    },
  };
}

