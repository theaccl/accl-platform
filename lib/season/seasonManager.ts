/**
 * Phase 22 — half-year competitive seasons (UTC). Derived dates only; no ranking changes.
 * Season IDs: S1-YYYY (Jan–Jun), S2-YYYY (Jul–Dec).
 */

export type SeasonStatus = "upcoming" | "active" | "completed";

export type SeasonMeta = {
  season_id: string;
  start_at: string;
  end_at: string;
  status: SeasonStatus;
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** ISO bounds for half-year in UTC. */
function halfYearBounds(year: number, half: 1 | 2): { start: Date; end: Date } {
  if (half === 1) {
    return {
      start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
      end: new Date(Date.UTC(year, 6, 1, 0, 0, 0, 0) - 1),
    };
  }
  return {
    start: new Date(Date.UTC(year, 6, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0) - 1),
  };
}

export function seasonIdForUtc(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const t = d.getTime();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const half: 1 | 2 = m < 6 ? 1 : 2;
  return `S${half}-${y}`;
}

export function parseSeasonId(seasonId: string): { half: 1 | 2; year: number } | null {
  const m = /^S([12])-(\d{4})$/.exec(seasonId.trim());
  if (!m) return null;
  const half = Number(m[1]) === 2 ? 2 : 1;
  const year = parseInt(m[2], 10);
  if (!Number.isFinite(year)) return null;
  return { half, year };
}

export function previousSeasonId(seasonId: string): string | null {
  const p = parseSeasonId(seasonId);
  if (!p) return null;
  if (p.half === 2) return `S1-${p.year}`;
  return `S2-${p.year - 1}`;
}

export function nextSeasonId(seasonId: string): string | null {
  const p = parseSeasonId(seasonId);
  if (!p) return null;
  if (p.half === 1) return `S2-${p.year}`;
  return `S1-${p.year + 1}`;
}

function seasonStatusForRange(start: Date, end: Date, now: Date): SeasonStatus {
  if (now < start) return "upcoming";
  if (now > end) return "completed";
  return "active";
}

/**
 * Meta for the season containing `at` (UTC).
 */
export function getSeasonMeta(at: Date = new Date()): SeasonMeta {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth();
  const half: 1 | 2 = m < 6 ? 1 : 2;
  const { start, end } = halfYearBounds(y, half);
  const season_id = `S${half}-${y}`;
  return {
    season_id,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    status: seasonStatusForRange(start, end, at),
  };
}

export function getSeasonMetaForId(seasonId: string): SeasonMeta | null {
  const p = parseSeasonId(seasonId);
  if (!p) return null;
  const { start, end } = halfYearBounds(p.year, p.half);
  const now = new Date();
  return {
    season_id: seasonId,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    status: seasonStatusForRange(start, end, now),
  };
}

/** Map a tournament or game start time to its competitive season id (for display / grouping). */
export function seasonIdForTournamentStart(startUtc: string | null): string | null {
  if (!startUtc) return null;
  const t = Date.parse(startUtc);
  if (!Number.isFinite(t)) return null;
  return seasonIdForUtc(new Date(t));
}
