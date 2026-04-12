import { createClient } from '@supabase/supabase-js';

import { extractModeratorAccessRoles } from '@/lib/moderatorAuth';

type RequiredModeratorEnv = {
  E2E_MODERATOR_EMAIL: string;
  E2E_MODERATOR_PASSWORD: string;
  E2E_NON_MODERATOR_EMAIL: string;
  E2E_NON_MODERATOR_PASSWORD: string;
  E2E_SUPABASE_SERVICE_ROLE_KEY: string;
  E2E_SUPABASE_URL: string;
};

const REQUIRED_ENV_KEYS = [
  'E2E_MODERATOR_EMAIL',
  'E2E_MODERATOR_PASSWORD',
  'E2E_NON_MODERATOR_EMAIL',
  'E2E_NON_MODERATOR_PASSWORD',
  'E2E_SUPABASE_SERVICE_ROLE_KEY',
  'E2E_SUPABASE_URL',
] as const;

function readTrimmedEnv(name: (typeof REQUIRED_ENV_KEYS)[number]): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function requireModeratorE2EEnv(): RequiredModeratorEnv {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !readTrimmedEnv(key));
  if (missing.length > 0) {
    throw new Error(
      [
        'Moderator E2E env validation failed.',
        `Missing required env vars: ${missing.join(', ')}`,
        'Set all required values and re-run: npm run test:e2e -- tests/smoke/moderator-*.spec.ts',
      ].join(' ')
    );
  }

  return {
    E2E_MODERATOR_EMAIL: readTrimmedEnv('E2E_MODERATOR_EMAIL') as string,
    E2E_MODERATOR_PASSWORD: readTrimmedEnv('E2E_MODERATOR_PASSWORD') as string,
    E2E_NON_MODERATOR_EMAIL: readTrimmedEnv('E2E_NON_MODERATOR_EMAIL') as string,
    E2E_NON_MODERATOR_PASSWORD: readTrimmedEnv('E2E_NON_MODERATOR_PASSWORD') as string,
    E2E_SUPABASE_SERVICE_ROLE_KEY: readTrimmedEnv('E2E_SUPABASE_SERVICE_ROLE_KEY') as string,
    E2E_SUPABASE_URL: readTrimmedEnv('E2E_SUPABASE_URL') as string,
  };
}

export function enforceModeratorSeedSafety(targetUrl: string): void {
  const url = new URL(targetUrl);
  const host = url.hostname.toLowerCase();
  const isLocalHost = host === '127.0.0.1' || host === 'localhost' || host.endsWith('.local');
  const explicitRemoteApproval = process.env.E2E_ALLOW_REMOTE_DB_SEED === 'true';

  if (host.includes('prod') || host.includes('production')) {
    throw new Error(
      `Refusing moderator E2E seed against likely production host "${host}". Use a non-production Supabase project.`
    );
  }

  if (!isLocalHost && !explicitRemoteApproval) {
    throw new Error(
      [
        `Moderator E2E seed safety check failed for host "${host}".`,
        'Set E2E_ALLOW_REMOTE_DB_SEED=true only when targeting a dedicated non-production environment.',
      ].join(' ')
    );
  }
}

function hasModeratorAccessRole(appMetadata: Record<string, unknown>): boolean {
  const roles = extractModeratorAccessRoles(appMetadata);
  return roles.has('moderator') || roles.has('admin');
}

async function getUserByEmail(input: {
  supabaseUrl: string;
  serviceRoleKey: string;
  email: string;
}): Promise<{ id: string; email?: string; app_metadata?: Record<string, unknown> }> {
  const client = createClient(input.supabaseUrl, input.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const normalizedEmail = input.email.toLowerCase();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Failed to list Supabase users for role validation: ${error.message}`);
    }
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? '').toLowerCase() === normalizedEmail);
    if (match) return match;
    if (users.length < 200) break;
    page += 1;
  }

  throw new Error(`Supabase user lookup failed for "${input.email}". Ensure the E2E account exists.`);
}

export async function validateModeratorRoleExpectations(env: RequiredModeratorEnv): Promise<void> {
  const moderatorUser = await getUserByEmail({
    supabaseUrl: env.E2E_SUPABASE_URL,
    serviceRoleKey: env.E2E_SUPABASE_SERVICE_ROLE_KEY,
    email: env.E2E_MODERATOR_EMAIL,
  });
  const nonModeratorUser = await getUserByEmail({
    supabaseUrl: env.E2E_SUPABASE_URL,
    serviceRoleKey: env.E2E_SUPABASE_SERVICE_ROLE_KEY,
    email: env.E2E_NON_MODERATOR_EMAIL,
  });

  const moderatorMetadata = (moderatorUser.app_metadata ?? {}) as Record<string, unknown>;
  if (!hasModeratorAccessRole(moderatorMetadata)) {
    throw new Error(
      `Role validation failed: ${env.E2E_MODERATOR_EMAIL} must include moderator/admin role in app_metadata.`
    );
  }

  const nonModeratorMetadata = (nonModeratorUser.app_metadata ?? {}) as Record<string, unknown>;
  if (hasModeratorAccessRole(nonModeratorMetadata)) {
    throw new Error(
      `Role validation failed: ${env.E2E_NON_MODERATOR_EMAIL} must NOT include moderator/admin role in app_metadata.`
    );
  }
}
