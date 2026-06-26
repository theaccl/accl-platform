# ACCL New-Player Rating Initialization — Baseline 1000

**Status:** Stage 1 lane (`stage1/rating-initialization-1000`)
**Migration:** `supabase/migrations/20260625120000_rating_initialization_baseline_1000.sql`
**Verification:** `supabase/RATING_INITIALIZATION_1000_VERIFICATION.sql`

## Controlling decision

Ordinary new-player rating seed is **1000** across all six major families:

- ACCL Overall (`accl_overall`)
- Tournament (`tournament_unified`)
- Bullet (`free_bullet`)
- Blitz (`free_blitz`)
- Rapid (`free_rapid`)
- Daily (`free_day`)

New accounts therefore begin in the **E band** (1000–1199), not the legacy C-band appearance at 1500.

## Authoritative provisioning

1. App inserts a minimal `profiles` row after verified signup (no rating fields).
2. Database trigger `trg_profiles_seed_player_ratings` inserts all rating buckets at **1000 / 0 games**.
3. First rated game settlement uses the existing O2 rating engine unchanged; lazy row creation also seeds **1000 / 0**.

TypeScript mirror: `lib/eloRating.ts` → `STARTING_RATING = 1000`.

## Zero-game legacy correction

A one-time, idempotent migration correction may move **untouched legacy 1500 / 0** values to **1000** only when **all** conservative checks pass:

- ordinary player profile (not a fixed platform bot UUID);
- no `games` row as White or Black (any status);
- no `tournament_entries` row;
- no `player_rating_history_ledger` row;
- no `player_ratings` row with `games_played > 0`;
- each major family row is either missing (repaired at 1000) or exactly **1500 / 0** before correction.

Players with **any** game participation or rating-history activity are **never** reset by this lane.

The correction does **not** write rating-history ledger events and does **not** rewrite historical ratings.

## Out of scope

- Elo formulas, K factors, finish-game settlement, O2 dual-write logic
- Badge settlement activation
- Ticker layout, rank-band presentation formulas, Nexus doctrine
- Production apply (separate authorized phase)

## Badge settlement boundary

`player_badge_state.settlement_rating` and `lib/badgeTracks.ts` → `defaultSettlementRatingForNewTrack()` remain at **1500**.

Badge settlement 1500 remains separate future-owner scope and does not affect the six player rating families. Badge state is not displayed as ACCL Overall, Tournament, Bullet, Blitz, Rapid, or Daily on Profile; it does not write `player_ratings` or alter Elo settlement paths.

## Trigger bucket scope (12 rows per new profile)

| Bucket | Meaning | New seed | Six-family lock |
|---|---|---:|---|
| `accl_overall` | ACCL Overall | 1000 | Yes |
| `tournament_unified` | Tournament | 1000 | Yes |
| `free_bullet` | Bullet | 1000 | Yes |
| `free_blitz` | Blitz | 1000 | Yes |
| `free_rapid` | Rapid | 1000 | Yes |
| `free_day` | Daily | 1000 | Yes |
| `free_live` | Legacy free live tempo | 1000 | No (schema parity) |
| `free_daily` | Legacy free daily tempo | 1000 | No (schema parity) |
| `free_correspondence` | Legacy free correspondence | 1000 | No (schema parity) |
| `tournament_live` | Legacy tournament live | 1000 | No (schema parity) |
| `tournament_daily` | Legacy tournament daily | 1000 | No (schema parity) |
| `tournament_correspondence` | Legacy tournament correspondence | 1000 | No (schema parity) |

Legacy six buckets remain provisioned for backward-compatible schema completeness; the one-time backfill corrects only the six major families.

## Operational impact (production apply)

During the migration transaction:

- Explicit `SHARE ROW EXCLUSIVE` locks block concurrent INSERT/UPDATE/DELETE on `profiles`, `games`, `tournament_entries`, `player_rating_history_ledger`, and `player_ratings`.
- Ordinary reads remain possible under those explicit locks.
- `ALTER TABLE player_ratings ALTER COLUMN rating SET DEFAULT 1000` may acquire `ACCESS EXCLUSIVE` on `player_ratings`; reads of that table may therefore wait briefly until the migration transaction completes.
- Profile creation, game/rating settlement, tournament registration, and related writes may wait briefly; no permanent maintenance mode is introduced.

Production apply must be short, controlled, and separately authorized. Executable migration proof on a disposable local Supabase stack must succeed before production apply.

## Production apply checklist

Run `supabase/RATING_INITIALIZATION_1000_VERIFICATION.sql` before and after apply. Required invariants:

- `ineligible_accounts_whose_ratings_changed_must_be_zero` = 0
- `eligible_major_family_rows_not_at_1000_after` = 0
