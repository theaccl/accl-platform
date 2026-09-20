export type MagicLinkSessionTokens = {
  access_token: string;
  refresh_token: string;
};

/** Admin-generated magic links return an implicit fragment, even to PKCE clients. */
export function magicLinkSessionFromHash(hash: string): MagicLinkSessionTokens | null {
  if (!hash.startsWith('#')) return null;
  const params = new URLSearchParams(hash.slice(1));
  if (params.get('type') !== 'magiclink' || params.get('token_type') !== 'bearer') return null;

  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

export async function consumeMagicLinkSession(
  hash: string,
  clearFragment: () => void,
  setSession: (tokens: MagicLinkSessionTokens) => Promise<{ error: { message: string } | null }>,
): Promise<'ignored' | 'signed_in' | 'failed'> {
  const tokens = magicLinkSessionFromHash(hash);
  if (!tokens) return 'ignored';
  // Do not leave credentials in the address bar or browser history while Auth validates them.
  clearFragment();
  try {
    const { error } = await setSession(tokens);
    return error ? 'failed' : 'signed_in';
  } catch {
    return 'failed';
  }
}
