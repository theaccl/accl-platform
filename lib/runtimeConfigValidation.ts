import { createClient } from '@supabase/supabase-js';
import fetchPolyfill from 'cross-fetch';

type ValidationCategory =
  | 'missing_env'
  | 'invalid_env'
  | 'missing_profile'
  | 'mismatched_bot_identity'
  | 'ok';

export type ValidationState = {
  key: string;
  category: ValidationCategory;
  ok: boolean;
  detail: string;
};

export type RuntimeConfigValidationReport = {
  generated_at: string;
  states: ValidationState[];
  has_errors: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let didLogSyncWarnings = false;
let asyncCache: { at: number; report: RuntimeConfigValidationReport } | null = null;

function push(states: ValidationState[], key: string, ok: boolean, category: ValidationCategory, detail: string) {
  states.push({ key, ok, category, detail });
}

function isJwtLike(value: string): boolean {
  return value.split('.').length === 3;
}

function syncStates(): ValidationState[] {
  const states: ValidationState[] = [];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  if (!url) push(states, 'NEXT_PUBLIC_SUPABASE_URL', false, 'missing_env', 'required');
  else {
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) {
        push(states, 'NEXT_PUBLIC_SUPABASE_URL', false, 'invalid_env', 'must be http/https URL');
      } else {
        push(states, 'NEXT_PUBLIC_SUPABASE_URL', true, 'ok', 'present');
      }
    } catch {
      push(states, 'NEXT_PUBLIC_SUPABASE_URL', false, 'invalid_env', 'malformed URL');
    }
  }

  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  if (!anon) push(states, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', false, 'missing_env', 'required');
  else if (!isJwtLike(anon)) push(states, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', false, 'invalid_env', 'must be JWT-like');
  else push(states, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', true, 'ok', 'present');

  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const serviceFallback = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  if (!service && !serviceFallback) {
    push(
      states,
      'SUPABASE_SERVICE_ROLE_KEY',
      false,
      'missing_env',
      'SUPABASE_SERVICE_ROLE_KEY or E2E_SUPABASE_SERVICE_ROLE_KEY required'
    );
  } else if (!isJwtLike(service || serviceFallback)) {
    push(states, 'SUPABASE_SERVICE_ROLE_KEY', false, 'invalid_env', 'service role key must be JWT-like');
  } else {
    push(
      states,
      'SUPABASE_SERVICE_ROLE_KEY',
      true,
      'ok',
      service ? 'using SUPABASE_SERVICE_ROLE_KEY' : 'using E2E_SUPABASE_SERVICE_ROLE_KEY fallback'
    );
  }

  const queueSecret = process.env.ACCL_ANALYSIS_QUEUE_SECRET?.trim() ?? '';
  if (!queueSecret) push(states, 'ACCL_ANALYSIS_QUEUE_SECRET', false, 'missing_env', 'required');
  else if (queueSecret.length < 16) push(states, 'ACCL_ANALYSIS_QUEUE_SECRET', false, 'invalid_env', 'must be at least 16 chars');
  else push(states, 'ACCL_ANALYSIS_QUEUE_SECRET', true, 'ok', 'present');

  const botEnv = [
    ['BOT_USER_ID_CARDI', process.env.BOT_USER_ID_CARDI?.trim() ?? ''],
    ['BOT_USER_ID_AGGRO', process.env.BOT_USER_ID_AGGRO?.trim() ?? ''],
    ['BOT_USER_ID_ENDGAME', process.env.BOT_USER_ID_ENDGAME?.trim() ?? ''],
  ] as const;
  const botNonEmpty = botEnv.filter(([, v]) => Boolean(v));
  if (botNonEmpty.length === 0) {
    push(
      states,
      'BOT_USER_IDS',
      true,
      'ok',
      'optional — no BOT_USER_ID_* set (computer/bot routes need all three distinct UUIDs)'
    );
    push(states, 'BOT_IDENTITY_SET', true, 'ok', 'skipped (bots not configured)');
  } else if (botNonEmpty.length !== 3) {
    for (const [key, value] of botEnv) {
      if (!value) {
        push(states, key, false, 'missing_env', 'when any BOT_USER_ID_* is set, all three must be set to distinct UUIDs');
      } else if (!UUID_RE.test(value)) {
        push(states, key, false, 'invalid_env', 'must be UUID');
      } else {
        push(states, key, true, 'ok', 'present');
      }
    }
    push(states, 'BOT_IDENTITY_SET', false, 'mismatched_bot_identity', 'partial bot env — set all three or none');
  } else {
    for (const [key, value] of botEnv) {
      if (!UUID_RE.test(value)) push(states, key, false, 'invalid_env', 'must be UUID');
      else push(states, key, true, 'ok', 'present');
    }
    const unique = new Set(botEnv.map(([, v]) => v).filter(Boolean));
    if (unique.size !== 3) {
      push(states, 'BOT_IDENTITY_SET', false, 'mismatched_bot_identity', 'bot env IDs must be distinct');
    } else {
      push(states, 'BOT_IDENTITY_SET', true, 'ok', 'distinct bot IDs');
    }
  }

  return states;
}

function buildReport(states: ValidationState[]): RuntimeConfigValidationReport {
  return {
    generated_at: new Date().toISOString(),
    states,
    has_errors: states.some((s) => !s.ok),
  };
}

export function getRuntimeConfigValidationSync(): RuntimeConfigValidationReport {
  return buildReport(syncStates());
}

export function logBootConfigWarningsOnce(): void {
  if (didLogSyncWarnings) return;
  didLogSyncWarnings = true;
  const report = getRuntimeConfigValidationSync();
  const bad = report.states.filter((s) => !s.ok);
  if (bad.length === 0) {
    console.info('[config-validation] boot env sync checks: OK');
    return;
  }
  for (const state of bad) {
    console.warn(`[config-validation] ${state.category} ${state.key}: ${state.detail}`);
  }
}

export async function getRuntimeConfigValidationReport(force = false): Promise<RuntimeConfigValidationReport> {
  if (!force && asyncCache && Date.now() - asyncCache.at < 30_000) {
    return asyncCache.report;
  }

  const states = syncStates();
  const syncBad = states.some((s) => !s.ok);
  if (syncBad) {
    const report = buildReport(states);
    asyncCache = { at: Date.now(), report };
    return report;
  }

  const botsFullyConfigured =
    Boolean(process.env.BOT_USER_ID_CARDI?.trim()) &&
    Boolean(process.env.BOT_USER_ID_AGGRO?.trim()) &&
    Boolean(process.env.BOT_USER_ID_ENDGAME?.trim());
  if (!botsFullyConfigured) {
    const report = buildReport(states);
    asyncCache = { at: Date.now(), report };
    return report;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim())!;
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchPolyfill as unknown as typeof fetch },
  });

  const botConfig = [
    ['BOT_USER_ID_CARDI', process.env.BOT_USER_ID_CARDI!.trim()],
    ['BOT_USER_ID_AGGRO', process.env.BOT_USER_ID_AGGRO!.trim()],
    ['BOT_USER_ID_ENDGAME', process.env.BOT_USER_ID_ENDGAME!.trim()],
  ] as const;

  for (const [keyName, userId] of botConfig) {
    const { data: profile, error: profileErr } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (profileErr) {
      push(states, `${keyName}_PROFILE`, false, 'invalid_env', `profile lookup error: ${profileErr.message}`);
      continue;
    }
    if (!profile?.id) {
      push(states, `${keyName}_PROFILE`, false, 'missing_profile', `profile ${userId} not found`);
      continue;
    }

    const admin = await supabase.auth.admin.getUserById(userId);
    if (admin.error || !admin.data?.user?.id) {
      push(
        states,
        `${keyName}_AUTH_USER`,
        false,
        'mismatched_bot_identity',
        `profile ${userId} has no matching auth user`
      );
      continue;
    }
    push(states, `${keyName}_IDENTITY`, true, 'ok', 'profile + auth user provisioned');
  }

  const report = buildReport(states);
  asyncCache = { at: Date.now(), report };
  return report;
}

export function getQueueSecretValidationState(): ValidationState {
  const report = getRuntimeConfigValidationSync();
  return (
    report.states.find((s) => s.key === 'ACCL_ANALYSIS_QUEUE_SECRET') ?? {
      key: 'ACCL_ANALYSIS_QUEUE_SECRET',
      ok: false,
      category: 'missing_env',
      detail: 'required',
    }
  );
}

