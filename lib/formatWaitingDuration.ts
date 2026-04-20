/** Short label for how long an open seat has been waiting (no date-fns dependency). */
export function formatWaitingDuration(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 45) return 'Just posted';
  const min = Math.floor(sec / 60);
  if (min < 60) return `Waiting ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `Waiting ${h}h`;
  return `Waiting ${Math.floor(h / 24)}d+`;
}
