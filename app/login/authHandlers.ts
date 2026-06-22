import { resolvePostAuthRoute } from '@/lib/loginPostAuthRoute';
import { SIGNUP_SUCCESS_MESSAGE } from '@/lib/loginPageMode';
import { validateAcclUsername } from '@/lib/usernameRules';

export type SignInResult =
  | { ok: true; destination: string }
  | { ok: false; message: string };

export type SignUpResult =
  | { ok: true; message: string; sessionCreated: boolean; destination?: string }
  | { ok: false; message: string };

export type LoginAuthHandlerDeps = {
  signInWithPassword: (args: { email: string; password: string }) => Promise<{
    error: { message: string } | null;
    data: { session: { access_token: string } | null };
  }>;
  signUp: (args: {
    email: string;
    password: string;
    options?: { data?: { username: string } };
  }) => Promise<{
    error: { message: string } | null;
    data: { session: { access_token: string } | null };
  }>;
  auditLogin: (accessToken: string) => Promise<void>;
  resolvePostAuthRoute: typeof resolvePostAuthRoute;
};

const defaultDeps: LoginAuthHandlerDeps = {
  signInWithPassword: async () => ({
    error: { message: 'signInWithPassword not configured' },
    data: { session: null },
  }),
  signUp: async () => ({
    error: { message: 'signUp not configured' },
    data: { session: null },
  }),
  auditLogin: async () => {},
  resolvePostAuthRoute,
};

export async function performSignIn(
  input: { email: string; password: string; nextParam: string | null },
  deps: LoginAuthHandlerDeps = defaultDeps,
): Promise<SignInResult> {
  const { error, data } = await deps.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  if (!data.session?.access_token) {
    return { ok: false, message: 'Sign-in failed. Try again.' };
  }
  try {
    await deps.auditLogin(data.session.access_token);
  } catch {
    /* non-blocking */
  }
  const destination = await deps.resolvePostAuthRoute(data.session.access_token, input.nextParam);
  return { ok: true, destination };
}

export async function performSignUp(
  input: {
    email: string;
    password: string;
    username: string;
    signupMode: boolean;
    nextParam: string | null;
  },
  deps: LoginAuthHandlerDeps = defaultDeps,
): Promise<SignUpResult> {
  if (input.signupMode) {
    const uv = validateAcclUsername(input.username);
    if (!uv.ok) {
      return { ok: false, message: uv.error };
    }
    const { error, data } = await deps.signUp({
      email: input.email.trim(),
      password: input.password,
      options: { data: { username: uv.username } },
    });
    if (error) {
      return { ok: false, message: error.message };
    }
    if (data.session?.access_token) {
      const destination = await deps.resolvePostAuthRoute(data.session.access_token, input.nextParam);
      return {
        ok: true,
        message: SIGNUP_SUCCESS_MESSAGE,
        sessionCreated: true,
        destination,
      };
    }
    return { ok: true, message: SIGNUP_SUCCESS_MESSAGE, sessionCreated: false };
  }

  const { error } = await deps.signUp({
    email: input.email.trim(),
    password: input.password,
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: SIGNUP_SUCCESS_MESSAGE, sessionCreated: false };
}
