/** Lobby hub badges: cap display at 99+. */
export function formatLobbyCountLabel(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 99) return '99+';
  return String(Math.floor(n));
}
