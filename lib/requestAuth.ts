import { createClient } from '@supabase/supabase-js';

export type AuthenticatedUser = {
  id: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
};

export async function resolveAuthenticatedUser(request: Request): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) return null;
  const token = m[1]?.trim();
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  const client = createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return {
    id: data.user.id,
    app_metadata: (data.user.app_metadata ?? {}) as Record<string, unknown>,
    user_metadata: (data.user.user_metadata ?? {}) as Record<string, unknown>,
  };
}

export async function resolveAuthenticatedUserId(request: Request): Promise<string | null> {
  const user = await resolveAuthenticatedUser(request);
  return user?.id ?? null;
}
