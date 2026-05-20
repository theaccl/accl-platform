import type { ValidationState } from '@/lib/runtimeConfigValidation';
import { getRuntimeConfigValidationSync } from '@/lib/runtimeConfigValidation';

const BOT_ENV_KEYS = ['BOT_USER_ID_CARDI', 'BOT_USER_ID_AGGRO', 'BOT_USER_ID_ENDGAME'] as const;

/**
 * Play Computer start only needs a valid env contract (all three BOT_USER_ID_* or none).
 * Full async provisioning (every bot profile + auth user) is for operator/Nexus diagnostics.
 */
export function playComputerBotEnvFailures(): ValidationState[] {
  const report = getRuntimeConfigValidationSync();
  return report.states.filter(
    (s) =>
      !s.ok &&
      (s.key === 'BOT_IDENTITY_SET' ||
        s.key === 'BOT_USER_IDS' ||
        (BOT_ENV_KEYS as readonly string[]).includes(s.key)),
  );
}

export function playComputerProvisioningErrorBody(failures: ValidationState[]): Record<string, unknown> {
  const first = failures[0]!;
  return {
    error: 'Bot provisioning invalid',
    category: first.category,
    key: first.key,
    detail: first.detail,
    states: failures,
  };
}

export function playComputerMissingProfileBody(
  profileBot: string,
  botUserId: string,
): Record<string, unknown> {
  return {
    error: 'Bot provisioning invalid',
    category: 'missing_profile',
    key: `${profileBot}_PROFILE`,
    detail: `profile ${botUserId} not found`,
  };
}
