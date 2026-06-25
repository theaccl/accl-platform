export function isTransientAuthNetworkError(
  err: { message?: string; name?: string } | null | undefined,
): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  const name = (err.name ?? '').toLowerCase();
  return (
    name.includes('network') ||
    name.includes('timeout') ||
    m.includes('failed to fetch') ||
    m.includes('network request failed') ||
    m.includes('networkerror') ||
    m.includes('timeout') ||
    m.includes('ecconnrefused') ||
    m.includes('econnreset')
  );
}

export function isInvalidStoredSessionError(
  err: { message?: string; status?: number } | null | undefined,
): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  if (isTransientAuthNetworkError(err)) return false;
  if (
    m.includes('refresh token') ||
    m.includes('invalid jwt') ||
    m.includes('jwt expired') ||
    m.includes('user not found') ||
    m.includes('invalid claim') ||
    m.includes('sub claim') ||
    m.includes('session missing') ||
    m.includes('invalid session') ||
    m.includes('session_id claim') ||
    m.includes('bad_jwt')
  ) {
    return true;
  }
  return false;
}
