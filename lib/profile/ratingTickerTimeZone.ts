/**
 * IANA timezone resolution for rating-ticker calendar grouping.
 * Does not persist a player timezone or touch account/database fields.
 *
 * Generic resolver order (the product ticker explicitly selects UTC):
 *  1. Explicit injected valid IANA zone (helpers/tests)
 *  2. Intl.DateTimeFormat().resolvedOptions().timeZone
 *  3. Documented deterministic fallback: UTC
 */

export const RATING_TICKER_FALLBACK_TIME_ZONE = 'UTC';
/** The product-wide ticker calendar and visible axis are intentionally UTC. */
export const RATING_TICKER_DISPLAY_TIME_ZONE = 'UTC';
export const RATING_TICKER_NONFINITE_INSTANT = 'rating ticker instant is not finite';
export const RATING_TICKER_NONFINITE_CIVIL = 'rating ticker civil time is not finite';
export const RATING_TICKER_CIVIL_DAY_UNRESOLVED =
  'rating ticker civil day has no valid instant in zone';

const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export type CivilDate = {
  year: number;
  month: number;
  day: number;
};

export type CivilDateTime = CivilDate & {
  hour: number;
  minute: number;
  second: number;
  isoWeekday: number;
};

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(injected?: string | null): string {
  if (injected && isValidTimeZone(injected)) return injected;
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved && isValidTimeZone(resolved)) return resolved;
  } catch {
    /* use fallback */
  }
  return RATING_TICKER_FALLBACK_TIME_ZONE;
}

export function civilDateKey(date: CivilDate): number {
  return date.year * 10000 + date.month * 100 + date.day;
}

function assertFiniteInstant(ms: number): void {
  if (!Number.isFinite(ms)) {
    throw new TypeError(RATING_TICKER_NONFINITE_INSTANT);
  }
}

function assertFiniteCivilParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): void {
  if (![year, month, day, hour, minute, second].every((n) => Number.isFinite(n))) {
    throw new TypeError(RATING_TICKER_NONFINITE_CIVIL);
  }
}

function partNumber(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const raw = parts.find((p) => p.type === type)?.value ?? '';
  return Number(raw);
}

export function instantToCivil(ms: number, timeZone: string): CivilDateTime {
  assertFiniteInstant(ms);
  const tz = resolveTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  return {
    year: partNumber(parts, 'year'),
    month: partNumber(parts, 'month'),
    day: partNumber(parts, 'day'),
    hour: partNumber(parts, 'hour'),
    minute: partNumber(parts, 'minute'),
    second: partNumber(parts, 'second'),
    isoWeekday: WEEKDAY_TO_ISO[weekday] ?? 1,
  };
}

function zoneOffsetMs(ms: number, timeZone: string): number {
  const civil = instantToCivil(ms, timeZone);
  const asUtc = Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day,
    civil.hour,
    civil.minute,
    civil.second,
  );
  return asUtc - ms;
}

/** Civil clock in `timeZone` → UTC epoch ms. DST uses a two-pass offset correction. */
export function zonedCivilToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): number {
  assertFiniteCivilParts(year, month, day, hour, minute, second);
  const tz = resolveTimeZone(timeZone);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const instant = utcGuess - zoneOffsetMs(utcGuess, tz);
  return utcGuess - zoneOffsetMs(instant, tz);
}

/**
 * Earliest valid instant belonging to `date` in `timeZone`.
 * Local 00:00 is used when it exists. When midnight is skipped (spring-forward
 * at 00:00), the result is the first instant of the same civil date — never the
 * preceding civil day.
 */
export function startOfCivilDayUtcMs(date: CivilDate, timeZone: string): number {
  assertFiniteCivilParts(date.year, date.month, date.day);
  const tz = resolveTimeZone(timeZone);
  const target = civilDateKey(date);
  const probe = probeInstantOnCivilDay(date, tz, target);
  let lo = probe - 36 * 60 * 60 * 1000;
  let hi = probe;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (civilDateKey(instantToCivil(mid, tz)) < target) lo = mid;
    else hi = mid;
  }
  const resolved = instantToCivil(hi, tz);
  if (civilDateKey(resolved) !== target) {
    throw new TypeError(RATING_TICKER_CIVIL_DAY_UNRESOLVED);
  }
  return hi;
}

function probeInstantOnCivilDay(date: CivilDate, tz: string, target: number): number {
  const hourProbes = [12, 1, 2, 3, 6, 9, 15, 18, 21, 0, 4, 5, 7, 8, 10, 11, 13, 14, 16, 17, 19, 20, 22, 23];
  for (const hour of hourProbes) {
    const ms = zonedCivilToUtcMs(date.year, date.month, date.day, hour, 0, 0, tz);
    if (!Number.isFinite(ms)) continue;
    if (civilDateKey(instantToCivil(ms, tz)) === target) return ms;
  }
  throw new TypeError(RATING_TICKER_CIVIL_DAY_UNRESOLVED);
}

export function addCivilDays(date: CivilDate, days: number): CivilDate {
  assertFiniteCivilParts(date.year, date.month, date.day);
  if (!Number.isFinite(days)) {
    throw new TypeError(RATING_TICKER_NONFINITE_CIVIL);
  }
  const utc = Date.UTC(date.year, date.month - 1, date.day) + days * 24 * 60 * 60 * 1000;
  const d = new Date(utc);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export function formatOccurredAtInZone(iso: string, timeZone: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTimeZone(timeZone),
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(t));
}
