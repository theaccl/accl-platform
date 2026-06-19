# PHASE 3G.6 — O2 Implementation Decision Lock

## Title and status

| Property | Value |
|----------|--------|
| **Document** | PHASE 3G.6 — O2 Implementation Decision Lock |
| **Pass type** | Docs-only decision lock (revised after read-only discovery) |
| **Status** | Pending owner review and commit |
| **Implementation** | None in this pass |
| **Authoritative base** | `origin/main` at `3423f70` — Merge PR #3 (Phase 3G.5 readiness report) |
| **Precedes** | O2 SQL migration and static spec (separate authorized pass) |

This document locks the open decisions identified in `docs/phase-3g5-o2-accl-overall-write-readiness-report.md` §14, revised per Phase 3G.6 read-only discovery. No O2 code, migrations, or production contact occur in this pass.

---

## 1. ACCL Overall clamp / uncap

### Current state (discovery-confirmed)

The existing 4000 ceiling is enforced in **two layers**:

1. **Settlement calculation** — `apply_free_play_rating_update_core` currently clamps all bucket updates with:

   ```text
   greatest(100, least(4000, before + delta))
   ```

   Source: `supabase/migrations/20260619180000_free_play_true_elo_rating.sql`

2. **Table constraint** — `player_ratings` has:

   ```text
   player_ratings_rating_reasonable CHECK (rating between 100 and 4000)
   ```

   Source: `supabase/migrations/20260409120000_rating_system_eight_bucket_fresh.sql`

   O1 added `accl_overall` to the bucket CHECK but did **not** relax this rating CHECK for any bucket.

### Locked O2 decision

| Rule | Lock |
|------|------|
| **ACCL Overall floor** | 100 |
| **ACCL Overall upper ceiling** | **None** — numerically uncapped |
| **Mode and tournament buckets** | Retain present 100–4000 behavior unless separately authorized |
| **Apply-path math** | O2 must **not** apply `least(4000, …)` to the `accl_overall` calculation |
| **Table constraint** | O2 must alter the table-level rating constraint in a **bucket-specific** way so **only** `accl_overall` is uncapped |
| **Global uncap** | O2 must **not** globally remove the upper bound for every bucket |

**Reason:** ACCL Overall is the canonical platform-wide stream and doctrine expects it to be uncapped. Shipping the first real `accl_overall` writer with a known 4000 ceiling (in either layer) would create avoidable debt.

**Implementation boundary:** O2 must achieve the `accl_overall`-only exception without prescribing exact constraint SQL in this document. The change must be limited to `accl_overall`; unrelated buckets stay capped.

---

## 2. ACCL Overall Elo inputs

**Decision:** ACCL Overall settlement uses an **independent** Elo stream with these inputs only:

| Input | Source |
|-------|--------|
| Self rating | Player's current `player_ratings.bucket = 'accl_overall'` rating |
| Self games played (K-factor) | Player's current `accl_overall` `games_played` |
| Opponent rating | Opponent's current `accl_overall` rating at apply time |
| Expected score | `elo_expected_score(self_accl_overall, opp_accl_overall)` |
| K-factor | `elo_k_factor_for_games_played(accl_overall.games_played)` — same 40 / 32 / 20 progression as true free-play Elo |
| Model version label | `v3_accl_overall_elo` (distinct from `v2_elo_free` and `v1_fixed_tournament`) |

**Explicit prohibition:** The ACCL Overall calculation must **not** use the player's Bullet, Blitz, Rapid, Daily, or tournament rating as its rating input or games-played input. Mode-bucket Elo (`v2_elo_free`) and ACCL Overall Elo (`v3_accl_overall_elo`) are separate streams in the same transaction.

**Reason:** Doctrine locks one ACCL Overall Elo stream across eligible contexts; mode buckets remain separate per-game-class streams.

---

## 3. Automatic dual-player settlement

**Decision:** For every eligible completed rated **free-play** game, O2 updates ACCL Overall for **both White and Black** in the same authoritative backend settlement transaction as the existing legacy and P1 mode-bucket updates.

**Clarification:** This is an automatic backend rating write path invoked after game completion — **not** a visible calculator UI, frontend feature, or client-side rating engine. The existing finish trigger and `apply_free_play_rating_update_core` remain the sole live write authority; O2 extends that function only.

**Preserved idempotency:** Same transaction, same `games.rating_applied` flip, same `SELECT FOR UPDATE` / concurrent-apply guards as today.

---

## 4. Free-play-only boundary

**Decision:**

| Rule | Lock |
|------|------|
| **ACCL Overall writes** | Apply **only** when `play_context = 'free'` |
| **Tournament ACCL** | O2 must **not** write `accl_overall` or `accl` ledger rows when `play_context = 'tournament'` |
| **`tournament_unified`** | Existing SQL finish settlement remains **unchanged** |
| **T1/T2/T3** | No tournament settlement-boundary authority is introduced in O2 |

**Reason:** O2 is free-play-only. Tournament ACCL Overall writes wait for later T1/T2/T3 authority per Stage 1 doctrine.

**Discovery note:** TypeScript classification marks tournament as `deferred_bracket`, but SQL still applies `tournament_unified` at finish today. O2 does not reconcile that divergence; it only adds a free-play ACCL path without altering tournament behavior.

---

## 5. Ledger lock

### Canonical ACCL Overall row shape

| Field | Locked value |
|-------|----------------|
| `rating_track_id` | `'accl'` |
| `rating_scope` | `'overall'` |
| `ecosystem` | `'global'` |
| `event_type` | `'game'` (live apply) |
| `rating_model_version` | `'v3_accl_overall_elo'` |

**Reason for track id:** Doctrine prefers `'accl'` as the canonical track id. O1-A readers tolerate `'accl_overall'` as a read alias; new writes use `'accl'`.

### Relationship to existing ledger rows

**Decision:** ACCL Overall ledger rows are **additional** rows. O2 must **not** replace, rename, or alter existing mode-scope ledger rows (`free_bullet`, `free_blitz`, `free_rapid`, `free_day`, `tournament` tracks with `rating_scope = 'mode'`).

### `rating_model_version` column

**Current state:** `rating_history_ledger_insert_row` hardcodes the ledger column to `'v1'` for all inserts. Mode-row metadata may carry truthful `elo_meta.rating_model_version` (`v2_elo_free` or `v1_fixed_tournament`) in JSON metadata only.

**Decision:**

- The `rating_model_version` **ledger column** for new ACCL Overall rows **must** contain `v3_accl_overall_elo`.
- Metadata may **additionally** mirror `v3_accl_overall_elo` for audit consistency.
- Metadata-only labeling is **not sufficient**.
- O2 extends the insert helper or append path **only as necessary** to satisfy the above for ACCL Overall rows.
- Existing historical rows and existing mode-row insert behavior must **not** be rewritten or relabeled.

---

## 6. Badge and player_badge_state boundary

**Decision:** O2 must not activate badge settlement, must not write `player_badge_state`, and must not create exact-control ledger rows.

**Reason:** Badge Stage 3 and exact-control infrastructure remain deferred per Stage 1 doctrine and BR1 dormant shims. O2 is rating storage + ACCL ledger only.

**Preserved behavior:**

- `apply_free_play_badge_settlement` shim call order unchanged (badge → ledger append)
- Shim continues to return `applied: false`
- No new exact-scope ledger rows gated on badge `applied: true`

---

## 7. Smallest authorized O2 implementation package after this lock

**Decision:** After this docs-only lock is reviewed and committed, the smallest implementation package may be:

| Deliverable | In scope |
|-------------|----------|
| **One Supabase migration** | Replace or extend **only** the relevant SQL functions and the `accl_overall`-specific rating constraint (see below) |
| **One static/unit migration spec** | e.g. `tests/unit/acclOverallO2Migration.spec.ts` |
| **Thin app read fallback** | Only if needed to parse ACCL snapshot fields when ledger empty |
| **Frontend UI / ticker** | **Out of scope** |
| **O3 reconstruction** | **Out of scope** |
| **Tournament T1/T2/T3** | **Out of scope** |
| **Badge Stage 3** | **Out of scope** |
| **Production SQL / deploy** | **Separate approval required** |

### Authorized migration touch points

The migration may modify **only**:

| Target | Purpose |
|--------|---------|
| `apply_free_play_rating_update_core` | Free-play `accl_overall` dual-write for both players; uncapped apply math for `accl_overall` |
| `append_rating_history_ledger_for_game_apply` | Append `accl` / `overall` / `global` rows (free-play only) |
| `rating_history_ledger_insert_row` | **Only if needed** to accept truthful `v3_accl_overall_elo` for ACCL rows |
| `player_ratings` rating constraint | **Bucket-specific** `accl_overall` uncap exception per §1 |

**Not authorized:** Unrelated function rewrites, tournament settlement changes, badge activation, global uncap, or schema changes beyond the above.

**Atomic apply requirement (unchanged from 3G.5):** Free-play legacy + P1 mode write + `accl_overall` write + `accl` ledger rows in one transaction; `games.rating_applied` remains sufficient idempotency for this package.

---

## 8. Discovery basis

Read-only discovery (Phase 3G.6) confirmed the current completed-game rating pipeline:

```text
finish_game_core
  → games_apply_free_rating_after_finish (AFTER UPDATE OF status trigger)
  → trg_games_apply_free_rating_after_finish
  → apply_free_play_rating_update_core
```

**Confirmed behavior today:**

- The engine **automatically updates both White and Black** on each eligible apply.
- It writes **legacy pace buckets** and **P1 mode/tournament buckets** only (`classify_rating_bucket` + `classify_p1_rating_bucket`).
- It does **not** write `accl_overall` (O1 seeded structural rows at 1500/0 only).
- It appends **mode-scope** ledger rows; exact-scope rows remain inactive behind the disabled badge shim.
- No live writer aliases ACCL Overall to `tournament_unified`.

Authoritative SQL: `supabase/migrations/20260619180000_free_play_true_elo_rating.sql` (apply core + ledger append).

---

## References

- `docs/phase-3g5-o2-accl-overall-write-readiness-report.md` — inventory and proposed strategy
- `docs/accl-stage1-canonical-overall-rating-doctrine.md` — D0 doctrine (O2, U1, T1–T3)

---

## Final confirmations (this pass)

| Check | Result |
|-------|--------|
| Docs-only | Yes |
| App code modified | No |
| Tests modified | No |
| Supabase / migrations | No |
| SQL / production / deploy | No |
| Secrets used | No |

*Awaiting explicit approval to commit this revised decision lock before O2 implementation begins.*
