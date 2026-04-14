export function normalizeChatBody(raw: unknown): { ok: true; body: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'body must be a string' };
  const t = raw.trim();
  if (t.length < 1) return { ok: false, error: 'body is empty' };
  if (t.length > 2000) return { ok: false, error: 'body too long (max 2000)' };
  return { ok: true, body: t };
}
