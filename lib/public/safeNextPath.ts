/** Internal path only — blocks protocol-relative and traversal. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t.startsWith('/') || t.startsWith('//')) return null;
  if (t.includes('..')) return null;
  if (t.length > 512) return null;
  return t;
}
