import { resolveAuthenticatedUser } from '@/lib/requestAuth';

export type ModeratorGuardResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string };

function parseModeratorUserIdsEnv(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function parseRoleList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

export type ModeratorAccessRole = 'moderator' | 'admin';

export function extractModeratorAccessRoles(appMetadata: Record<string, unknown>): Set<ModeratorAccessRole> {
  const roles = new Set<ModeratorAccessRole>();
  const normalized = [
    ...parseRoleList(appMetadata.roles),
    ...parseRoleList(appMetadata.accl_roles),
    ...parseRoleList(appMetadata.role),
    ...parseRoleList(appMetadata.accl_role),
  ];
  for (const role of normalized) {
    if (role === 'moderator' || role === 'admin') roles.add(role);
  }
  return roles;
}

export function isAdminUser(appMetadata: Record<string, unknown>): boolean {
  return extractModeratorAccessRoles(appMetadata).has('admin');
}

export function isModeratorUser(input: {
  userId: string;
  appMetadata: Record<string, unknown>;
  allowedModeratorUserIdsEnv?: string;
  enableAllowlistFallback?: boolean;
}): boolean {
  const roles = extractModeratorAccessRoles(input.appMetadata);
  if (roles.has('moderator') || roles.has('admin')) return true;
  if (!input.enableAllowlistFallback) return false;
  const acl = parseModeratorUserIdsEnv(input.allowedModeratorUserIdsEnv);
  return acl.has(input.userId);
}

export async function requireModerator(request: Request): Promise<ModeratorGuardResult> {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
  const allowed = isModeratorUser({
    userId: user.id,
    appMetadata: user.app_metadata,
    allowedModeratorUserIdsEnv: process.env.ACCL_MODERATOR_USER_IDS,
    enableAllowlistFallback: process.env.ACCL_ENABLE_MODERATOR_ID_FALLBACK === 'true',
  });
  if (!allowed) return { ok: false, status: 403, error: 'Moderator role required' };
  return { ok: true, userId: user.id };
}

export async function requireModeratorAdmin(request: Request): Promise<ModeratorGuardResult> {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
  if (!isAdminUser(user.app_metadata)) {
    return { ok: false, status: 403, error: 'Admin role required' };
  }
  return { ok: true, userId: user.id };
}
