import type { NexusEcosystem } from '@/lib/nexus/getNexusData';

type AuthMetaShape = {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

/**
 * **Trusted:** ecosystem comes from Supabase Auth claims/metadata only (not client input).
 * Unmarked accounts default to `adult`. K–12 accounts must be tagged (`k12` / `ecosystem_scope`).
 */
export function resolveUserNexusEcosystemFromAuthMetadata(user: AuthMetaShape): NexusEcosystem {
  const am = (user.app_metadata ?? {}) as Record<string, unknown>;
  const um = (user.user_metadata ?? {}) as Record<string, unknown>;
  const candidates = [am.ecosystem_scope, am.ecosystem, um.ecosystem_scope, um.ecosystem, um.k12, am.k12];
  for (const raw of candidates) {
    if (raw === true) return 'k12';
    const s = String(raw ?? '')
      .trim()
      .toLowerCase();
    if (s === 'k12' || s === 'k-12') return 'k12';
  }
  return 'adult';
}
