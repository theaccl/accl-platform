# PHASE 3G.5 — O2 Readiness / ACCL Overall Write-Integration Design

## 1. Title and status

| Property | Value |
|----------|--------|
| **Document** | PHASE 3G.5 — O2 Readiness / ACCL Overall Write-Integration Design |
| **Pass type** | Docs-only readiness report |
| **Status** | Accepted working report (inventory/design lock) |
| **Implementation** | None |
| **SQL** | None |
| **Migration** | None |
| **Production contact** | None |

This document preserves the read-only inventory and design findings from Phase 3G.5. It governs how `accl_overall` should eventually receive real rating writes after O1 bucket foundation, O1-A read-path separation, PR #1 (BR1/O1/O1-A), and PR #2 (ticker/time-control doctrine).

---

## 2. Current branch / base

| Item | Value |
|------|--------|
| **Worktree** | `C:\Users\Chees\accl-platform-o2-readiness` |
| **Branch** | `stage1/o2-readiness` |
| **Base** | `0058499` — Merge PR #2 rating ticker doctrine |
| **Prior merges** | PR #1 (BR1/O1/O1-A) merged before this branch |
| **Working tree at lock** | Clean |

---

## 3. Files inspected

### SQL migrations (authoritative write/read paths)

- `supabase/migrations/20260406120000_free_play_rating_activation.sql` — `games.rating_applied` idempotency column
- `supabase/migrations/20260409120000_rating_system_eight_bucket_fresh.sql` — core apply, RPC wrapper, finish trigger
- `supabase/migrations/20260416120000_finish_pipeline_vault_winner_hook.sql` — trigger + Vault winner hook
- `supabase/migrations/20260517120000_p1_dual_write_rating_apply.sql` — legacy + P1 dual-write pattern
- `supabase/migrations/20260519200000_tournament_zero_move_rating_void.sql` — lifecycle/zero-move guards
- `supabase/migrations/20260619120000_free_play_badge_settlement_foundation.sql` — badge settlement (real body; superseded by BR1 shims in production path)
- `supabase/migrations/20260619160000_rating_history_ledger_foundation.sql` — ledger table, insert helper, append hook
- `supabase/migrations/20260619180000_free_play_true_elo_rating.sql` — **current** `apply_free_play_rating_update_core` + ledger append (True Elo free-play)
- `supabase/migrations/20260621150000_production_rating_baseline_reconciliation.sql` — BR1 dormant badge shims, ledger parity, pre-O1 guards
- `supabase/migrations/20260621160000_accl_overall_o1_bucket_foundation_snapshot_separation.sql` — O1 bucket + snapshot separation

### App / lib (read paths)

- `lib/applyFreePlayRatingUpdate.ts`
- `lib/ratingClassification.ts`
- `lib/p1PublicRatingRead.ts`, `lib/p1RatingsSpec.ts`, `lib/profileRatingTracks.ts`
- `lib/profileRatingHistoryBuild.ts`, `lib/ratingHistoryLedgerBuild.ts`
- `lib/loadProfileRatingDashboard.ts`
- `lib/nexus/getLiveGames.ts`, `lib/nexus/getStandings.ts`
- `components/identity/PublicIdentityCard.tsx`

### Tests

- `tests/unit/acclOverallO1Migration.spec.ts`
- `tests/unit/o1aReadPathWiring.spec.ts`
- `tests/unit/freePlayTrueEloMigration.spec.ts`
- `tests/unit/ratingHistoryLedgerMigration.spec.ts`
- `tests/unit/profileRatingHistoryBuild.spec.ts`
- `tests/unit/ratingHistoryLedgerBuild.spec.ts`

### Doctrine / runbooks / scripts

- `docs/accl-stage1-canonical-overall-rating-doctrine.md` (D0 — O2/T1–T3 spec)
- `docs/accl-rating-ticker-time-control-outcome-profile-doctrine.md` (PR #2 — UI doctrine, no SQL)
- `docs/accl-badge-phase-1-consolidated-spec.md`
- `docs/runbooks/accl-rating-baseline-reconciliation-br1.md`
- `scripts/backfill-rating-history-ledger.mjs`

---

## 4. Current free-play rating write-path map

```
Game status → finished
  └─ Trigger: games_apply_free_rating_after_finish
       └─ trg_games_apply_free_rating_after_finish
            ├─ apply_free_play_rating_update_core(p_game_id)
            └─ emit_vault_relic_for_finished_game_winner (errors isolated)

Client path (free-play immediate only):
  applyFreePlayRatingUpdate → RPC apply_free_play_rating_update → apply_free_play_rating_update_core
```

**Inside `apply_free_play_rating_update_core` (authoritative body: `20260619180000_free_play_true_elo_rating.sql`):**

1. **Guards:** finished; lifecycle void (`superseded`, `expired_open_seat`, `abandoned_before_move`, `no_first_move`); zero-move void; `rating_applied` already true; `play_context ∈ {free, tournament}`; `rated = true`; both seated distinct humans; valid legacy + P1 bucket; known result.
2. **Legacy bucket update:** classify via `classify_rating_bucket`; UPDATE both players' legacy bucket rows.
3. **P1 mode bucket update:** classify via `classify_p1_rating_bucket`; UPDATE both players' P1 mode bucket rows (free-play: True Elo `v2_elo_free`; tournament: fixed ±10 `v1_fixed_tournament`).
4. **Badge shim call:** when `ctx = 'free'`, calls `apply_free_play_badge_settlement` (BR1 shim returns `applied: false`).
5. **Ledger append:** `append_rating_history_ledger_for_game_apply(p_game_id, out, v_badge)`.
6. **`games.rating_applied` final flip:** `UPDATE games SET rating_applied = true, rating_last_update = out WHERE rating_applied IS NOT TRUE`; concurrent miss returns `concurrent_apply_or_already_applied`.

**Free-play math today:** True Elo with K derived from **P1 mode bucket** `games_played`; opponent rating from **P1 mode bucket**; clamp `[100, 4000]`.

---

## 5. Current tournament_unified write path

**Live write path:** `apply_free_play_rating_update_core` when `play_context = 'tournament'`:

1. `classify_p1_rating_bucket(...)` returns `'tournament_unified'`.
2. Legacy tournament pace bucket is also updated (dual-write).
3. Fixed ±10 deltas (`v1_fixed_tournament`), not True Elo.
4. The same finish trigger fires for all finished games (free and tournament).

**Historical one-time writes:** P1 backfill in `20260516120000_p1_ratings_truth_additive.sql` (not live settlement).

**Not written from:** app TS code, badge settlement (disabled), or O1 migration.

---

## 6. Current accl_overall read paths

O1/O1-A read paths (all show seed **1500 / 0 games** until O2 writes land):

| Surface | Source / behavior |
|---------|-------------------|
| **Public profile snapshot** | `get_public_profile_snapshot` (O1): `player_ratings.bucket = 'accl_overall'` → `p1.accl_rating`, `p1.accl_overall` |
| **Profile rating tracks** | `profileRatingTracks.ts`: ACCL card from `accl_overall.rating` / `games_played` |
| **Public identity card** | `PublicIdentityCard.tsx` / `acclRatingFromP1`: `p1.accl_overall` or legacy `accl_rating`; **no** tournament fallback |
| **Live game display** | `getLiveGames.ts`: fetches `accl_overall` among P1 buckets |
| **Rating history ledger builder** | `ratingHistoryLedgerBuild.ts`: profile track `'accl'` accepts ledger rows with `rating_track_id ∈ {'accl', 'accl_overall'}` |
| **Profile rating dashboard** | `loadProfileRatingDashboard.ts`: ledger-first history; games fallback when ledger empty; `profileRatingHistoryBuild.ts` **excludes** ACCL from games-based fallback intentionally |

Additional read wiring: `ratingFromPlayerRatingsMap` (O1-A) uses `accl_overall` in non-tournament contexts; `getStandings.ts` reads `tournament_unified` only (separate stream).

---

## 7. Current accl_overall write status

| Finding | Status |
|---------|--------|
| **Live settlement write** | **None** — apply core updates only legacy + P1 mode buckets |
| **O1 structural seed** | INSERT at 1500/0 for missing profiles + new-profile trigger |
| **Copy from tournament_unified** | **None** (O1 N01 explicitly forbidden) |
| **Game backfill** | **None** |
| **Apply-core dual-write** | **Not implemented** (O1 out-of-scope; O2 deliverable) |

---

## 8. rating_history_ledger population

**Live path (sole writer for game events):**

`apply_free_play_rating_update_core` → `append_rating_history_ledger_for_game_apply` → `rating_history_ledger_insert_row` → `player_rating_history_ledger`

**Per finished rated game today:**

1. **Mode-scope row** — one per player: `rating_track_id` from `map_p1_bucket_to_rating_track_id(p1_bucket)` (`free_*` or `tournament`), `rating_scope = 'mode'`, `ecosystem = free|tournament`, `event_type = 'game'`.
2. **Exact-scope row** — only if `apply_free_play_badge_settlement` returns `applied: true` (BR1 shim returns `applied: false` → **no exact rows in production**).

**No ACCL Overall ledger rows** — `map_p1_bucket_to_rating_track_id` has no `accl_overall` / `accl` mapping.

**Backfill script:** `scripts/backfill-rating-history-ledger.mjs` reads `games.rating_last_update` (mode snapshots only); idempotent via unique indexes + PostgreSQL `23505` handling.

**Idempotency protections:**

- Partial unique indexes on `(player_id, rating_track_id, game_id[, event_type])`.
- `rating_history_ledger_insert_row` uses `ON CONFLICT DO NOTHING`.
- BR1 pre/post checks for cross-event duplicate `(player_id, rating_track_id, game_id)` with multiple `event_type`.

---

## 9. Idempotency / duplicate settlement protections

| Layer | Mechanism |
|-------|-----------|
| **`games.rating_applied`** | Early return with `already_applied` when true |
| **`SELECT FOR UPDATE`** | Game row locked at apply start |
| **Final UPDATE guard** | `UPDATE games ... WHERE rating_applied IS NOT TRUE`; 0 rows → `concurrent_apply_or_already_applied` |
| **Partial unique ledger indexes** | `uniq_rating_history_game_track`, backfill, bracket, tournament_batch variants |
| **`ON CONFLICT DO NOTHING`** | Ledger insert helper is repeat-safe |

**O2 note:** Free-play O2 can rely on `games.rating_applied` + atomic mode + `accl_overall` in one transaction per Stage 1 doctrine §8. Tournament ACCL (T3) will require settlement-run idempotency beyond `rating_applied` alone.

---

## 10. Tournament boundary protections

| Layer | Current behavior | O2 requirement |
|-------|------------------|----------------|
| **TS `ratingClassification.ts`** | Tournament → `updateTiming: 'deferred_bracket'`; client immediate RPC skips tournament | Aligns with O2 exclusion |
| **SQL apply core** | Tournament finishes **still apply immediately** to `tournament_unified` via finish trigger | Known repo gap (doctrine §6); **not** O2 scope to fix T2 |
| **O1 snapshot** | `accl_rating` decoupled from `tournament_unified` | Correct read separation |
| **O1-A history** | ACCL track excludes tournament games/ledger rows | Pre-O2 empty ACCL history is intentional |

**Locked O2 guard:** ACCL Overall writes must explicitly use `ctx <> 'tournament'` (or equivalent `play_context = 'free'` only).

**Deferred:** T1/T2/T3 tournament settlement authority is **not ready**. Tournament ACCL writes remain deferred until T3 per `docs/accl-stage1-canonical-overall-rating-doctrine.md`.

---

## 11. Badge / player_badge_state boundaries

| Control | State |
|---------|--------|
| **`player_badge_state`** | Schema exists (BR1 foundation); **0 rows expected**; SELECT-only; no write policies or table write grants |
| **`apply_free_play_badge_settlement`** | BR1 shim → `{ applied: false, reason: 'stage3_badge_settlement_disabled' }`; EXECUTE revoked from all client roles |
| **`settle_player_badge_state`** | BR1 shim → `stage3_badge_state_mutation_disabled`; no EXECUTE for any role |
| **Apply core call order** | Badge (free only) → ledger append; badge never INSERTs ledger directly |
| **Exact-control ledger rows** | Gated on badge `applied: true` → **inactive** today |

**O2 must not:** activate badge settlement, write `player_badge_state`, or add exact-control ledger rows.

---

## 12. Proposed O2 write strategy

Aligned with `docs/accl-stage1-canonical-overall-rating-doctrine.md` §4, §8, §11.

### Scope

- **Free-play only** (`play_context = 'free'`)
- Same eligibility guards as existing apply core
- **Atomic** with existing mode-bucket write in one transaction
- No tournament ACCL, badge, reconstruction (O3), or global uncap cleanup (U2)

### Storage write (inside `apply_free_play_rating_update_core`)

After existing P1 mode updates, when `ctx = 'free'`:

1. Ensure `accl_overall` rows exist (`INSERT ... ON CONFLICT DO NOTHING`).
2. `SELECT ... FOR UPDATE` both players' `accl_overall` rating + `games_played`.
3. Compute **independent** ACCL Overall Elo:
   - Opponent rating = opponent's **`accl_overall`** (not mode bucket)
   - K = `elo_k_factor_for_games_played(accl_overall.games_played)` — **not** mode GP
   - Model = `v3_accl_overall_elo` (distinct from `v2_elo_free`, `v1_fixed_tournament`)
   - Floor 100; upper clamp per open decision (see §14)
4. `UPDATE player_ratings SET rating, games_played+1 WHERE bucket = 'accl_overall'`.
5. Extend `out` snapshot with ACCL side before/after/delta + `elo_meta` for audit/backfill.

### Ledger write (inside `append_rating_history_ledger_for_game_apply`)

When `ctx = 'free'` and ACCL snapshot present, insert **one row per player**:

- `rating_track_id = 'accl'` (canonical per doctrine; O1-A reader accepts `'accl_overall'` alias)
- `rating_scope = 'overall'`
- `ecosystem = 'global'`
- `event_type = 'game'`
- `mode` / `time_control` from source game (ticker context)
- Truthful `rating_model_version` / metadata → `v3_accl_overall_elo`

### Explicit non-writes

- `ctx = 'tournament'` → no `accl_overall` update, no `accl` ledger row
- No badge settlement activation
- No `player_badge_state` mutations

---

## 13. Required implementation surfaces

| Surface | Required? | Notes |
|---------|-----------|-------|
| **One Supabase migration** | **Yes — primary deliverable** | Replace `apply_free_play_rating_update_core`; extend `append_rating_history_ledger_for_game_apply`; possibly extend `rating_history_ledger_insert_row` for model version; post-check assertions |
| **One static/unit migration spec** | **Yes** | Mirror `acclOverallO1Migration.spec.ts` + `freePlayTrueEloMigration.spec.ts` patterns |
| **Minimal app read fallback** | **Optional** | `profileRatingHistoryBuild.ts` — parse ACCL snapshot fields when ledger empty; no new client write paths |
| **O3 reconstruction** | **No** (separate slice) | Backfill job + disclosure deferred |

Deploy / SQL execution is a **separate authorized pass**, not part of this readiness lock.

---

## 14. Open decisions before implementation

These are **blocking decisions** that must be closed before O2 implementation begins:

1. **4000 clamp vs uncapped ACCL Overall** — Apply core still uses `least(4000,…)`; doctrine U1 expects uncapped `accl_overall`. Decide: ship O2 with clamp (implementation debt) or include U1 partial uncap on `accl_overall` only.
2. **`rating_model_version` hardcoded `v1` vs `v3_accl_overall_elo`** — `rating_history_ledger_insert_row` currently hardcodes `'v1'` in the column; O2 needs truthful model version on ACCL ledger rows (may require helper signature change).
3. **Canonical ledger track id: `accl` vs `accl_overall`** — Doctrine locks `'accl'`; O1-A reader already accepts both. Pick one canonical writer id.
4. **Tournament immediate SQL settlement divergence vs deferred doctrine** — TS says `deferred_bracket`; SQL applies `tournament_unified` at finish. Not O2 scope to fix T2, but creates visible divergence until T1/T2 land.

---

## 15. Recommended smallest implementation package

**Package name:** O2 — free-play ACCL Overall atomic dual-write + ACCL ledger rows

**Single migration** (after `20260621160000`), containing only:

1. `create or replace function apply_free_play_rating_update_core` — add free-only `accl_overall` dual-write + snapshot fields; preserve all existing guards, True Elo mode path, tournament ±10 path, badge shim call, ledger order, `rating_applied` semantics.
2. `create or replace function append_rating_history_ledger_for_game_apply` — append `accl` / `overall` / `global` rows from ACCL snapshot; free-only.
3. Optional: extend `rating_history_ledger_insert_row` to accept `p_rating_model_version`.
4. Migration post-check: no `player_badge_state` writes; no tournament ACCL writes in function body; `v3_accl_overall_elo` marker present.

**Single test file:** `tests/unit/acclOverallO2Migration.spec.ts` — static acceptance.

**Optional thin app diff:** `profileRatingHistoryBuild.ts` — ACCL games fallback from new snapshot fields.

**Explicitly defer:**

- O3 reconstruction
- Tournament T1/T2/T3 settlement
- U2 global uncap
- Badge Stage 3
- Ticker UI implementation (PR #2 doctrine)

---

## 16. Final confirmations

This readiness report lock pass confirms:

| Check | Result |
|-------|--------|
| **Docs-only report** | Yes — this file only |
| **Code written** | No |
| **Tests written** | No |
| **Migration created** | No |
| **SQL run** | No |
| **Production contact** | No |
| **Deploy** | No |
| **Secrets used** | No |
| **Dirty rescue worktree untouched** | `C:\Users\Chees\accl-platform` not touched |
| **ASI/Lean sandbox untouched** | Yes |

**Inventory method:** Read-only local inspection (`git status`, `git log`, workspace search, file reads). No Supabase CLI, no `db push`, no production commands.

---

*Locked: Phase 3G.5 O2 readiness inventory/design. Implementation awaits explicit authorization on a separate pass.*
