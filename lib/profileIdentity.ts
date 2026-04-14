import type { User } from "@supabase/supabase-js";

export function pickMeta(meta: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = meta[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

function formatStat(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  const s = String(v).trim();
  return s === "" ? "—" : s;
}

/** Public label only — never email. */
export const PUBLIC_DISPLAY_FALLBACK = "Player";

/**
 * Rejects strings that must never appear as public identity:
 * empty, email-shaped (@), full account email, or **email local-part** (never derive identity from email).
 */
export function sanitizePublicIdentityCandidate(
  raw: string | null | undefined,
  accountEmail: string | null | undefined,
): string | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  if (t.includes("@")) return undefined;
  const em = accountEmail?.trim().toLowerCase();
  if (em && t.toLowerCase() === em) return undefined;
  if (em?.includes("@")) {
    const local = em.split("@")[0]?.toLowerCase() ?? "";
    if (local && t.toLowerCase() === local) return undefined;
  }
  return t;
}

function devWarnIfDisplayCouldBeEmailLeak(displayName: string, email: string | null | undefined): void {
  if (process.env.NODE_ENV !== "development") return;
  const d = displayName.trim().toLowerCase();
  if (!d || d === "—") return;
  if (email?.trim()) {
    const e = email.trim().toLowerCase();
    if (d === e) {
      console.warn("[accl-identity] displayName equals account email — this should not happen");
    }
    if (email.includes("@")) {
      const local = email.split("@")[0]?.toLowerCase() ?? "";
      if (local && d === local) {
        console.warn("[accl-identity] displayName equals email local-part — possible identity leak");
      }
    }
  }
  if (displayName.includes("@")) {
    console.warn("[accl-identity] displayName contains @ — possible email leak");
  }
}

export type PublicIdentityPreviewOptions = {
  /** From `profiles.username` only (server or client). Required for stable public identity. */
  profileUsername?: string | null;
};

/**
 * Canonical public display name for a signed-in user.
 * Source of truth: `profiles.username` only. If missing or invalid → "Player".
 * Never uses `user.email`, `user_metadata`, or cached JWT display fields for display.
 */
export function resolvePublicDisplayIdentity(args: { profileUsername: string | null | undefined; user: User }): string {
  const email = args.user.email ?? null;
  const fromProfile = sanitizePublicIdentityCandidate(args.profileUsername, email);
  if (fromProfile) return fromProfile;
  return PUBLIC_DISPLAY_FALLBACK;
}

/**
 * Metadata must not be used for public display identity. Kept for call-sites that still pass
 * metadata; always returns {@link PUBLIC_DISPLAY_FALLBACK}. Prefer `profiles.username` via
 * `resolvePublicDisplayIdentity` or `publicDisplayNameFromProfileUsername`.
 */
export function publicDisplayNameFromUserMetadata(
  _meta: Record<string, unknown>,
  _accountEmail: string | null | undefined = undefined,
): string {
  return PUBLIC_DISPLAY_FALLBACK;
}

/**
 * Session-aware preview for NavigationBar, NEXUS, /profile.
 * `profileUsername` must come from `profiles` (e.g. `useProfileUsername` or server fetch); omitting → "Player".
 */
export function identityPreviewFromUser(user: User | null, opts?: PublicIdentityPreviewOptions) {
  if (!user) {
    return {
      displayName: "—",
      rank: "—",
      elo: "—",
      gamesPlayed: "—",
      wins: "—",
      streak: "—",
      record: "—",
    };
  }
  const displayName = resolvePublicDisplayIdentity({
    profileUsername: opts?.profileUsername ?? null,
    user,
  });
  devWarnIfDisplayCouldBeEmailLeak(displayName, user.email);

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const rank = pickMeta(meta, ["rank", "tier", "accl_rank", "accl_tier"]) ?? "—";
  const elo = pickMeta(meta, ["elo", "rating", "accl_rating", "accl_elo"]) ?? "—";
  const gamesPlayed = formatStat(meta.games_played ?? meta.gamesPlayed);
  const wins = formatStat(meta.wins);
  const streak = formatStat(meta.streak ?? meta.win_streak);

  let record = "—";
  const w = meta.wins;
  const l = meta.losses;
  if (typeof w === "number" && typeof l === "number") {
    record = `${w}–${l}`;
  } else if (meta.streak != null && String(meta.streak).trim() !== "") {
    record = `Streak ${meta.streak}`;
  } else if (pickMeta(meta, ["record", "win_loss", "wl"])) {
    record = pickMeta(meta, ["record", "win_loss", "wl"])!;
  }

  return { displayName, rank, elo, gamesPlayed, wins, streak, record };
}

/**
 * Profile / chat sender labels from stored username. Never returns email-shaped values,
 * full-email matches, or email local-part matches when `profileEmail` is known.
 */
export function publicDisplayNameFromProfileUsername(
  username: string | null | undefined,
  _userId?: string,
  profileEmail?: string | null,
): string {
  const t = username?.trim();
  if (!t) return PUBLIC_DISPLAY_FALLBACK;
  const sanitized = sanitizePublicIdentityCandidate(t, profileEmail ?? null);
  return sanitized ?? PUBLIC_DISPLAY_FALLBACK;
}

/**
 * Single public label: `profiles.username` sanitized against account email (including local-part), or Player.
 */
export function publicIdentityFromProfileUsername(
  profileUsername: string | null | undefined,
  accountEmail: string | null | undefined,
): string {
  return sanitizePublicIdentityCandidate(profileUsername, accountEmail) ?? PUBLIC_DISPLAY_FALLBACK;
}
