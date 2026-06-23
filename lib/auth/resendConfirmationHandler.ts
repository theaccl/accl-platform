import { createClient } from '@supabase/supabase-js';

import {
  buildEmailConfirmationCallbackUrl,
  resolveTrustedEmailConfirmationOrigin,
} from '@/lib/emailConfirmationRedirect';
import { validateEmailSyntax } from '@/lib/emailIntegrity';
import { getClientIp } from '@/lib/server/clientIp';
import { checkRateLimit } from '@/lib/server/rateLimit';

export const RESEND_CONFIRMATION_GENERIC_MESSAGE =
  'If this address needs confirmation, a new link has been sent. Check your inbox and spam folder.';

export type ResendConfirmationBody = {
  email?: unknown;
  next?: unknown;
};

export type ResendConfirmationRouteDeps = {
  getClientIp: typeof getClientIp;
  checkRateLimit: typeof checkRateLimit;
  createAuthClient: () => ReturnType<typeof createClient> | null;
  resolveTrustedEmailConfirmationOrigin: typeof resolveTrustedEmailConfirmationOrigin;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const defaultDeps: ResendConfirmationRouteDeps = {
  getClientIp,
  checkRateLimit,
  createAuthClient: () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !anon) return null;
    return createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  },
  resolveTrustedEmailConfirmationOrigin,
};

export async function resendConfirmationPost(
  request: Request,
  deps: ResendConfirmationRouteDeps = defaultDeps,
): Promise<Response> {
  const ip = deps.getClientIp(request);
  const ipLimit = deps.checkRateLimit(`resend-confirmation:ip:${ip}`, 8, 60_000);
  if (!ipLimit.allowed) {
    return json(
      { ok: false, error: 'rate_limited', retry_after_sec: ipLimit.retryAfterSec },
      429,
    );
  }

  let body: ResendConfirmationBody;
  try {
    body = (await request.json()) as ResendConfirmationBody;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const rawEmail = typeof body.email === 'string' ? body.email : '';
  const syntax = validateEmailSyntax(rawEmail);
  if (!syntax.ok) {
    return json({ ok: true, message: RESEND_CONFIRMATION_GENERIC_MESSAGE });
  }

  const emailLimit = deps.checkRateLimit(
    `resend-confirmation:email:${syntax.email}`,
    3,
    300_000,
  );
  if (!emailLimit.allowed) {
    return json(
      { ok: false, error: 'rate_limited', retry_after_sec: emailLimit.retryAfterSec },
      429,
    );
  }

  const origin = deps.resolveTrustedEmailConfirmationOrigin({
    requestOrigin: request.headers.get('origin'),
  });

  const emailRedirectTo = buildEmailConfirmationCallbackUrl(origin);

  const client = deps.createAuthClient();
  if (!client) {
    return json({ ok: true, message: RESEND_CONFIRMATION_GENERIC_MESSAGE });
  }

  await client.auth.resend({
    type: 'signup',
    email: syntax.email,
    options: { emailRedirectTo },
  });

  return json({ ok: true, message: RESEND_CONFIRMATION_GENERIC_MESSAGE });
}
