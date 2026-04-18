/**
 * Prefer `/profile/<username>` when set so URLs stay human-readable (no UUID in the bar).
 */
export function publicProfileHref(username: string | null | undefined, userId: string): string {
  const u = typeof username === 'string' ? username.trim() : '';
  if (u) {
    return `/profile/${encodeURIComponent(u)}`;
  }
  return `/profile/${userId}`;
}
