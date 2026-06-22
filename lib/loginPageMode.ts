export type AuthFormMode = 'login' | 'signup';

export function resolveAuthFormMode(intent: string | null | undefined): AuthFormMode {
  return (intent ?? '').toLowerCase() === 'signup' ? 'signup' : 'login';
}

export function isSignupMode(mode: AuthFormMode): boolean {
  return mode === 'signup';
}

export function getAuthPageHeading(mode: AuthFormMode): string {
  return mode === 'signup' ? 'Create your ACCL account' : 'Sign in to ACCL';
}

export function getPrimarySubmitLabel(mode: AuthFormMode, busy: boolean): string {
  if (busy) {
    return mode === 'signup' ? 'Creating account…' : 'Signing in…';
  }
  return mode === 'signup' ? 'Create account' : 'Log in';
}

export function getPrimarySubmitTestId(mode: AuthFormMode): 'signup-submit' | 'login-submit' {
  return mode === 'signup' ? 'signup-submit' : 'login-submit';
}

export function resolveFormSubmitAction(mode: AuthFormMode): AuthFormMode {
  return mode;
}

export function getAlternateModePrompt(mode: AuthFormMode): { lead: string; action: string } {
  return mode === 'signup'
    ? { lead: 'Already have an account?', action: 'Log in' }
    : { lead: 'Need an account?', action: 'Create one' };
}

/** Build `/login` href preserving `next` and toggling signup intent. */
export function buildAuthPageHref(mode: AuthFormMode, searchParams: URLSearchParams): string {
  const params = new URLSearchParams(searchParams.toString());
  if (mode === 'signup') {
    params.set('intent', 'signup');
  } else {
    params.delete('intent');
  }
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}

export function getPasswordAutocomplete(mode: AuthFormMode): 'new-password' | 'current-password' {
  return mode === 'signup' ? 'new-password' : 'current-password';
}

/** Shown when signUp returns no session (confirmation may be required). */
export const SIGNUP_VERIFICATION_PENDING_MESSAGE =
  'Check your email to confirm signup. Your account is not active until you confirm the link we send.';

/** Shown briefly when signUp returns an immediate session (no false confirmation copy). */
export const SIGNUP_ACTIVE_SESSION_MESSAGE = 'Account created. Continuing…';
