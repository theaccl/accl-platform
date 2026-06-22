import type { EmailOtpType } from '@supabase/supabase-js';

import { buildLoginConfirmationResultPath } from '@/lib/emailConfirmationRedirect';
import { requiresEmailVerificationForProvisioning } from '@/lib/emailVerificationGate';
import { getSafePostLoginRedirect } from '@/lib/nexus/nexusRouteHelpers';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Supabase signup confirmation links use `type=email` in the token_hash flow. */
export const SIGNUP_CONFIRMATION_OTP_TYPE = 'email' as const satisfies EmailOtpType;

export function parseSignupConfirmationOtpType(raw: string | null): typeof SIGNUP_CONFIRMATION_OTP_TYPE | null {
  return raw === SIGNUP_CONFIRMATION_OTP_TYPE ? SIGNUP_CONFIRMATION_OTP_TYPE : null;
}

export type EmailConfirmCallbackDeps = {
  createSupabaseServerClient: typeof createSupabaseServerClient;
};

const defaultDeps: EmailConfirmCallbackDeps = {
  createSupabaseServerClient,
};

function redirectTo(origin: string, path: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL(path, origin).toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  });
}

/** Handle Supabase email confirmation callback (PKCE code or token_hash). */
export async function handleEmailConfirmCallback(
  request: Request,
  deps: EmailConfirmCallbackDeps = defaultDeps,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const typeParam = requestUrl.searchParams.get('type');
  const code = requestUrl.searchParams.get('code');
  const nextParam = requestUrl.searchParams.get('next');

  if (!code && !tokenHash) {
    return redirectTo(origin, buildLoginConfirmationResultPath('missing'));
  }

  const supabase = await deps.createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return redirectTo(origin, buildLoginConfirmationResultPath('failed'));
    }
  } else {
    const otpType = parseSignupConfirmationOtpType(typeParam);
    if (!tokenHash || !otpType) {
      return redirectTo(origin, buildLoginConfirmationResultPath('missing'));
    }
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });
    if (error) {
      return redirectTo(origin, buildLoginConfirmationResultPath('failed'));
    }
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (
    userError ||
    (userData.user && requiresEmailVerificationForProvisioning(userData.user))
  ) {
    return redirectTo(origin, buildLoginConfirmationResultPath('failed'));
  }

  const safeNext = getSafePostLoginRedirect(nextParam);
  return redirectTo(origin, safeNext);
}
