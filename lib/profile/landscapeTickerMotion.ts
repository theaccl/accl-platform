/** Offset-path support gate for ignition head/sparks. Bloom stays last-point based. */

export function cssSupportsOffsetPath(
  css: { supports?: (property: string, value: string) => boolean } | undefined = typeof CSS === 'undefined' ? undefined : CSS,
): boolean {
  return Boolean(
    css &&
      typeof css.supports === 'function' &&
      css.supports('offset-path', "path('M 0 0 L 10 10')"),
  );
}

export function landscapeTickerRevealTimerKey(
  serial: number | null | undefined,
  phase: string | null | undefined,
): string | null {
  if (serial == null || (phase !== 'hero' && phase !== 'quiet')) return null;
  return `${serial}:${phase}`;
}
