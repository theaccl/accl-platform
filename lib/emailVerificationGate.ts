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

export function provisioningBlockedReason(user: EmailVerificationUser): 'email_verification_required' | null {
  return requiresEmailVerificationForProvisioning(user) ? 'email_verification_required' : null;
}
