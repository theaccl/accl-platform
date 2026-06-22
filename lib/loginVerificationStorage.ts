const PENDING_EMAIL_KEY = 'accl_pending_verification_email';

export function storePendingVerificationEmail(email: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_EMAIL_KEY, email);
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function readPendingVerificationEmail(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(PENDING_EMAIL_KEY);
  } catch {
    return null;
  }
}

export function clearPendingVerificationEmail(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    /* ignore */
  }
}
