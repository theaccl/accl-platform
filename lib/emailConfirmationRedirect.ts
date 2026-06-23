const CONFIRM_CALLBACK_PATH = '/auth/confirm';

/** Production canonical origin when env is unset (see docs/ops/ALPHA_TESTER_CONTROLLED_FLOW.md). */
export const DEFAULT_CANONICAL_EMAIL_CONFIRMATION_ORIGIN = 'https://play.theaccl.com';

/** Local development origins explicitly trusted for confirmation links. */
export const DEV_EMAIL_CONFIRMATION_ORIGIN_ALLOWLIST = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
] as const;

export type TrustedEmailConfirmationOriginInput = {
  /** Untrusted browser Origin header — never authoritative in production. */
  requestOrigin?: string | null;
  /** Client-side `window.location.origin` — validated against allowlist in non-production. */
  clientOrigin?: string | null;
  nodeEnv?: string;
};

function parseHttpOrigin(candidate: string): string | null {
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.startsWith('//')) return null;
  try {
    const url = new URL(trimmed);
    if (url.username || url.password) return null;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Canonical ACCL site origin from configuration, with repository default fallback. */
export function getCanonicalEmailConfirmationOrigin(): string {
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envOrigin) {
    const parsed = parseHttpOrigin(envOrigin);
    if (parsed) return parsed;
  }
  return DEFAULT_CANONICAL_EMAIL_CONFIRMATION_ORIGIN;
}

function isDevAllowlistedOrigin(origin: string): boolean {
  return (DEV_EMAIL_CONFIRMATION_ORIGIN_ALLOWLIST as readonly string[]).includes(origin);
}

/**
 * Resolve the trusted origin for Supabase `emailRedirectTo`.
 * Production always uses the canonical configured origin — never request Origin.
 */
export function resolveTrustedEmailConfirmationOrigin(
  input: TrustedEmailConfirmationOriginInput = {},
): string {
  const canonical = getCanonicalEmailConfirmationOrigin();
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? 'production';

  if (nodeEnv === 'production') {
    return canonical;
  }

  for (const raw of [input.clientOrigin, input.requestOrigin]) {
    if (!raw) continue;
    const parsed = parseHttpOrigin(raw);
    if (parsed && isDevAllowlistedOrigin(parsed)) {
      return parsed;
    }
  }

  return canonical;
}

/** @deprecated Use resolveTrustedEmailConfirmationOrigin — does not trust arbitrary Origin. */
export function resolveSiteOrigin(explicitOrigin?: string | null): string | null {
  return resolveTrustedEmailConfirmationOrigin({ clientOrigin: explicitOrigin });
}

/** Build the Supabase emailRedirectTo target for signup confirmation (fixed ACCL callback only). */
export function buildEmailConfirmationCallbackUrl(siteOrigin: string): string {
  const origin = siteOrigin.replace(/\/$/, '');
  return new URL(CONFIRM_CALLBACK_PATH, origin).toString();
}

export function buildLoginConfirmationResultPath(result: 'complete' | 'failed' | 'missing'): string {
  return `/login?confirmation=${result}`;
}
