/**
 * Central email-password verification rules for provisioning and routing.
 * OAuth / non-email identities are not gated here.
 */

export type EmailVerificationUser = {
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
  identities?: Array<{ provider?: string }> | null;
};

export function isEmailPasswordIdentity(user: EmailVerificationUser): boolean {
  const provider = user.app_metadata?.provider;
  if (typeof provider === 'string') {
    return provider === 'email';
  }
  const identities = user.identities ?? [];
  if (identities.length === 0) {
    return true;
  }
  const hasEmail = identities.some((identity) => identity.provider === 'email');
  const hasNonEmail = identities.some(
    (identity) => identity.provider && identity.provider !== 'email',
  );
  if (hasNonEmail && !hasEmail) {
    return false;
  }
  return hasEmail;
}

export function hasVerifiedMailbox(user: EmailVerificationUser): boolean {
  return Boolean(user.email_confirmed_at ?? user.confirmed_at);
}

/** True when durable provisioning must wait for mailbox confirmation. */
export function requiresEmailVerificationForProvisioning(user: EmailVerificationUser): boolean {
  return isEmailPasswordIdentity(user) && !hasVerifiedMailbox(user);
}

export const EMAIL_VERIFICATION_REQUIRED_CODE = 'email_verification_required' as const;

export const EMAIL_VERIFICATION_REQUIRED_MESSAGE =
  'Confirm your email before joining tournaments or using payment features.';

export function provisioningBlockedReason(user: EmailVerificationUser): typeof EMAIL_VERIFICATION_REQUIRED_CODE | null {
  return requiresEmailVerificationForProvisioning(user) ? EMAIL_VERIFICATION_REQUIRED_CODE : null;
}

/** Stable machine-readable payload for competitive and economic route denials. */
export function emailVerificationRequiredPayload(
  extra?: Record<string, unknown>,
): { code: typeof EMAIL_VERIFICATION_REQUIRED_CODE; error: string } & Record<string, unknown> {
  return {
    code: EMAIL_VERIFICATION_REQUIRED_CODE,
    error: EMAIL_VERIFICATION_REQUIRED_MESSAGE,
    ...extra,
  };
}
