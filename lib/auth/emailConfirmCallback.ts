import type { EmailOtpType } from '@supabase/supabase-js';

import { buildLoginConfirmationResultPath } from '@/lib/emailConfirmationRedirect';
import { requiresEmailVerificationForProvisioning } from '@/lib/emailVerificationGate';
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

type ConfirmSupabaseClient = {
  auth: {
    exchangeCodeForSession: (code: string) => Promise<{ error: { message: string } | null }>;
    verifyOtp: (args: { token_hash: string; type: typeof SIGNUP_CONFIRMATION_OTP_TYPE }) => Promise<{
      error: { message: string } | null;
    }>;
    getUser: () => Promise<{
      error: { message: string } | null;
      data: { user: Parameters<typeof requiresEmailVerificationForProvisioning>[0] | null };
    }>;
    signOut: () => Promise<{ error: { message: string } | null }>;
  };
};

async function clearVerificationSession(supabase: ConfirmSupabaseClient): Promise<{ ok: true } | { ok: false }> {
  const { error } = await supabase.auth.signOut();
  return error ? { ok: false } : { ok: true };
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

  if (!code && !tokenHash) {
    return redirectTo(origin, buildLoginConfirmationResultPath('missing'));
  }

  const supabase = (await deps.createSupabaseServerClient()) as ConfirmSupabaseClient;

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

  const cleared = await clearVerificationSession(supabase);
  if (!cleared.ok) {
    return redirectTo(origin, buildLoginConfirmationResultPath('failed'));
  }
  return redirectTo(origin, buildLoginConfirmationResultPath('complete'));
}
