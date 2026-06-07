# ACCL Stage 1 — Canonical Overall Rating Doctrine

## 1. Status and scope

**Status:** Approved doctrine map (D0 persistence).  
**Baseline reference:** `origin/main` at time of PO approval.  
**Pass type:** Docs-only. No implementation in this document.

This document locks Stage 1 architecture for **ACCL Overall** — an independent canonical identity rating distinct from Tournament Rating. It governs storage, ledger, eligibility, Elo formula, tournament settlement prerequisites, idempotency, historical reconstruction, staged rollout, and future SQL/test surfaces.

**In scope:** ACCL Overall doctrine, free-play rollout (O1–O3), tournament settlement prerequisites (T1–T4), platform uncapped rating doctrine (U0–U4).

**Explicitly out of scope (parked or separate slices):**

- Stage 3 exact-control infrastructure
- `player_badge_state` and badge settlement promotion
- `exact_time_control` rows
- Profile ticker UI changes
- SQL migrations and backfill execution
- Home-route auto-follow
- Notifications
- Rematch routing
- Daily concurrency
- Rated Daily Phase A/B
- Avatar stylization, Image Generator, AI governance

**Stage 2 comparison (unchanged):** Tournament + Bullet + Blitz + Rapid + Daily only — no ACCL comparison line.

**Stage 3 exact-control infrastructure:** Parked; tournament-boundary alignment applies when Stage 3 activates.

---

## 2. Locked canonical Overall doctrine

ACCL Overall is an **independent canonical identity rating**, not an alias of Tournament Rating.

| Property | Locked value |
|----------|----------------|
| **Storage** | `player_ratings.bucket = 'accl_overall'` |
| **Ledger track** | `rating_track_id = 'accl'` |
| **Scope** | `rating_scope = 'overall'` |
| **Ecosystem** | `ecosystem = 'global'` |
| **History** | One truthful ledger row per eligible source `game_id` per player |
| **Ticker** | ACCL ticker reads `accl` rows only after cutover |
| **Tournament Rating** | Remains `tournament_unified` / `tournament` track — separate stream |

**Permanently rejected:**

- `accl = tournament_unified` alias
- Display composites or synthetic movement
- Copying Tournament history into ACCL
- Mirroring tournament ±10 into ACCL Overall

---

## 3. Eligibility and exclusions

### Include

- Rated human free-play **Bullet**
- Rated human free-play **Blitz**
- Rated human free-play **Rapid**
- Rated human free-play **Daily**
- Rated **Tournament** — **only after settlement-boundary authority exists** (see §6)
- **Draws**
- Legitimate rated **rematches**

### Exclude

- Unrated games
- Bot / Play Computer
- Trainer
- Puzzle
- Canceled
- Voided
- Superseded
- Expired open seat
- Abandoned before move
- No first move
- Zero-move smoke cleanup
- Invalid or unclassified controls

### Apply guards (aligned with existing apply core)

Eligible games must satisfy: `finished`, `rated = true`, `play_context ∈ {free, tournament}`, both seated distinct humans, `move_count > 0`, allowed `end_reason`, valid P1 bucket classification, known result.

**Deployment gate:** If free-play ACCL Overall (O2) ships before tournament settlement authority (T1–T3), tournament games are **temporarily excluded** from ACCL Overall. Do **not** silently apply tournament ACCL at finish.

---

## 4. Canonical Elo formula

One ACCL Overall Elo stream for **all** eligible contexts. Never tournament ±10.

```text
ExpectedScore(self) = 1 / (1 + 10^((OpponentACCL - SelfACCL) / 400))
Delta(self)         = round_half_away_from_zero(K * (Score - ExpectedScore))
Score               = 1 | 0.5 | 0  (win | draw | loss)
K                   = f(ACCL Overall games_played): 40 (<8) | 32 (8–25) | 20 (≥26)
Opponent rating     = opponent accl_overall at apply time
Model version       = v3_accl_overall_elo (new; distinct from v2_elo_free, v1_fixed_tournament)
```

**K-factor source:** ACCL Overall `games_played` only — not mode buckets, not tournament unified.

**Tournament ±10:** Never mirrored into ACCL Overall.

---

## 5. Floor and platform-wide uncapped doctrine

### Lower floor

**Locked:** Floor = **100** for ACCL Overall and platform default until PO explicitly changes it. Floor doctrine is independent of uncapping the ceiling.

### Platform uncapped numeric doctrine

**Doctrine (locked):**

```text
All official ACCL rating streams → numerically uncapped
3600+ → Sovereign Eternal (terminal title; presentation only)
Higher ratings → valid; rare exceptional achievement; no additional named title tiers
Existing 4000 caps → implementation debt, not doctrine
```

**No mode, Tournament, Overall, or exact-control rating may remain permanently capped at 4000.**

### Staged rollout (doctrine unchanged during staging)

| Stage | Scope |
|-------|--------|
| **U0** | Uncapped-rating implementation audit and migration plan |
| **U1** | `accl_overall` ships without upper clamp |
| **U2** | Remove `player_ratings` 4000 CHECK and SQL `least(4000,…)` globally |
| **U3** | Remove TS `RATING_CEILING` assumptions and tests |
| **U4** | Align badge `settlement_rating` upper-cap constraints (Stage 3 only) |

`integer` columns already support large values once CHECK/clamps are removed.

---

## 6. Tournament settlement prerequisite

### Locked tournament doctrine

```text
Multi-game tournament events → rating and badge settlement at bracket completion
Single-elimination → settlement at advancement or knockout
```

### Not acceptable long-term

```text
Tournament Rating → immediate finish apply
ACCL Overall      → deferred only (without unified boundary authority)
```

### Final architecture rule

```text
Tournament source game finishes
  → advancement logic may continue
  → rating effects remain PENDING

Authoritative settlement boundary opens
  → process each eligible source game exactly once
  → Tournament Rating settles under tournament doctrine
  → ACCL Overall settles under canonical Overall Elo
  → badge settlement joins the same boundary when Stage 3 infrastructure is active
```

### Deployment gate

```text
ACCL Overall tournament eligibility
  → MUST NOT deploy until settlement-boundary authority exists
```

If O2 (free-play ACCL) ships first, tournament games remain temporarily excluded from ACCL Overall until settlement authority is live.

### Prerequisite implementation slices

| Slice | Deliverable |
|-------|-------------|
| **T1** | Settlement-boundary authority: table / RPC / run log + idempotency key |
| **T2** | Tournament Rating aligned to boundary (stop immediate finish apply) |
| **T3** | ACCL Overall tournament settlement hook (per-game, canonical Elo) |
| **T4** | Badge hook alignment when Stage 3 activates; optional tournament historical reconstruction spike |

Implementation may ship as audited slices; **doctrine is unified at the boundary**.

### Known repository gap (audit note)

TS classification may describe `deferred_bracket`, while finish triggers may still call immediate apply on every finish. T1/T2 must reconcile this before tournament ACCL deploys.

---

## 7. Per-source-game ledger and sequencing

At any settlement boundary (tournament) or at finish (free-play):

```text
Per eligible source game_id, per player:
  → exactly one ACCL ledger movement
  → real game_id preserved (clickable)
  → no bracket-level synthetic rating delta replacing per-game truth
  → no double application
```

Optional **metadata-only** settlement marker rows (zero delta, `event_settlement`) are allowed for chart markers — they must not replace per-game ACCL points.

### Required metadata at tournament settlement boundary

```text
settlement_id
settlement_kind
settlement_sequence   (1..N within the settlement run)
tournament_id
bracket_id
source game_id
```

### Deterministic source ordering (recommended)

```text
1. authoritative settlement boundary timestamp
2. bracket round / stage ordinal
3. source game finished_at
4. source game id
```

Persist `settlement_sequence` inside the settlement run.

### Chart sort (tournament-batch ACCL points)

```text
primary:   occurred_at (= settlement boundary timestamp)
secondary: settlement_sequence
link:      real source game_id
```

The UI may visually cluster same-boundary rows; every delta remains real and clickable.

---

## 8. Idempotency

Use a **per-track truth source**. Ledger uniqueness is authoritative.

### Free-play

```text
Single apply transaction → mode bucket + accl_overall (atomic)
games.rating_applied     → sufficient for this package
Ledger UNIQUE          → (player_id, 'accl', game_id)
```

### Tournament

```text
games.rating_applied → NOT sufficient alone
  (game may be finished while ACCL Overall remains pending)

Required:
  settlement run log     → unique settlement idempotency key
  ledger UNIQUE          → (player_id, rating_track_id, game_id)
                           independent of event_type
  optional fast path     → games.accl_overall_applied_at
```

### Invariant

A pre-cutover `backfill` row and a live `game` row must **never** coexist for the same `(player_id, accl, game_id)`.

### Re-run safety

Re-running the same replay or settlement processor:

```text
→ creates zero duplicate rows
→ changes zero ratings
```

---

## 9. Historical reconstruction and disclosure

ACCL Overall **did not exist** historically. Deterministic replay is **reconstruction**, not original apply-time truth.

### Row classification

| Row kind | `event_type` | `is_backfilled` | Notes |
|----------|--------------|-----------------|-------|
| Live post-cutover | `game` | `false` | Authoritative apply-time truth |
| Reconstructed pre-cutover | `backfill` | `true` | `metadata.reconstruction_model_version`, `metadata.reconstruction_scope` |

**Do not** describe reconstructed rows as original apply-time ACCL Overall history.

### Complete reconstruction doctrine

Historical ACCL Overall reconstruction:

```text
→ deterministic replay of eligible historical source games
→ reconstructed rows use event_type = backfill
→ reconstructed rows use is_backfilled = true
→ metadata records reconstruction_model_version and reconstruction_scope
→ replay writes truthful backfill ledger rows
→ replay also materializes the terminal player_ratings.accl_overall rating
→ replay also materializes accl_overall games_played
→ terminal canonical snapshot must equal the final reconstructed ledger state
→ execution must be repeat-safe
→ live ACCL Overall writes must be frozen, gated, or cut over safely while reconstruction runs
→ no backfill row and live row may coexist for the same player_id + accl + game_id
```

### Coverage policy

| Context | Policy |
|---------|--------|
| **Free-play** | Deterministic reconstruction **only** where source rows are complete and classifiable |
| **Tournament** | **Forward-only** from settlement-authority cutover **unless** separate engineering spike (T4) proves reliable historical bracket-boundary reconstruction |

### Rejected approaches

- Copying `tournament_unified` into ACCL
- Weighted seeds presented as earned game movement
- Partial reconstruction without disclosure
- Synthetic interpolation

### Player-facing disclosure

When replay is partial or forward-only:

```text
ACCL Overall history includes reconstructed movement from eligible historical games where source data was available.
Tournament-based ACCL Overall history begins <date>.
Earlier unavailable events are not shown on this track.
```

Shorter UI variants are allowed if meaning is preserved.

### Ops / audit surfaces

Must distinguish: **live writes** · **reconstructed backfill rows** · **excluded legacy rows**.

**ACCL ≠ Tournament:** Cards and tickers must not imply sameness when streams diverge.

---

## 10. Staged rollout

No implementation begins from this document alone. Sequence:

```text
D0  → persist docs-only Stage 1 doctrine after PO approval (this document)

U0  → uncapped-rating implementation audit + migration plan

O1  → accl_overall storage, snapshot separation (accl_rating ≠ tournament_rating), reader alias removal

O2  → free-play ACCL Overall atomic dual-write + accl ledger rows
      (tournament games EXCLUDED until T3)

O3  → deterministic free-play reconstruction tool + disclosure

T1  → tournament settlement-boundary authority

T2  → Tournament Rating boundary alignment

T3  → ACCL Overall tournament settlement hook

T4  → optional tournament historical reconstruction spike
      → else forward-only disclosure for tournament ACCL

Stage 3 (later) → badge / exact-control infrastructure
                  → tournament-boundary alignment where applicable
```

---

## 11. Future SQL surface map

```text
STORAGE
  player_ratings.bucket += 'accl_overall'
  seed on profile create
  floor CHECK 100; no upper CHECK on accl_overall (U1+)

SNAPSHOT
  get_public_profile_snapshot: accl_rating ← accl_overall
  tournament_rating ← tournament_unified (unchanged)

FREE APPLY (O2)
  apply_free_play_rating_update_core:
    mode bucket write (existing)
    + accl_overall true Elo write (same transaction)
  append ledger: mode row + accl row (ecosystem global)

TOURNAMENT (T1–T3) — blocked until T1 live
  settlement_boundary / settlement_run table + idempotency key
  settlement processor at bracket/advancement/knockout boundary
  per-game Tournament Rating settle (T2)
  per-game ACCL Overall settle (T3)
  metadata: settlement_id, settlement_kind, settlement_sequence,
            tournament_id, bracket_id, game_id

READERS (O1)
  remove accl → tournament alias in profileRatingHistoryBuild,
  ratingHistoryLedgerBuild, snapshot fallbacks

RECONSTRUCTION (O3)
  deterministic replay job:
    backfill ledger rows (event_type = backfill, is_backfilled = true)
    materialize terminal player_ratings.accl_overall + games_played
    terminal snapshot = final reconstructed ledger state
  guard: no live + backfill duplicate per (player, accl, game_id)
  live writes frozen/gated during reconstruction run

UNCAP (U0–U4)
  staged removal of CHECK + greatest/least(4000) + TS ceiling

IDEMPOTENCY
  uniq_rating_history_game_track (player, track, game_id)
  settlement_run UNIQUE key
  optional games.accl_overall_applied_at
```

**Out of scope (locked):** `player_badge_state`, exact-control ledger rows, badge settlement writers (Stage 3).

---

## 12. Future test map

```text
Eligibility matrix (all exclude/include paths)
Free O2: mode + accl_overall atomic; ledger accl row
Free O2: tournament games do NOT write accl until T3
Tournament: no accl at finish; accl only at boundary (T3)
T1/T2: settlement run idempotency; re-run zero side effects
T3: one accl row per player per source game_id at boundary
Settlement ordering: settlement_sequence stable across re-runs
No synthetic bracket delta row replacing per-game points
Ledger UNIQUE (player, accl, game_id) across event_types
No coexistence: backfill + live for same triple
games.rating_applied insufficient for pending tournament accl
Snapshot divergence: accl_rating ≠ tournament_rating
Ticker: accl reads accl only; tournament reads tournament only
Stage 2 regression: five families, no accl series
Elo parity: ACCL path TS ↔ SQL; never ±10 on accl
Uncapped: accl_overall > 4000 valid (U1+); platform doctrine U2–U4
Floor: cannot go below 100
Reconstruction: backfill metadata present; not labeled as live truth
Reconstruction: terminal accl_overall + games_played match final ledger
Reconstruction: repeat-safe; frozen live writes during run
Disclosure copy when partial / forward-only
Replay repeatability: same inputs → same rating at Tn
```

---

## 13. Remaining PO decisions

1. **Settlement timestamp authority:** Exact field source (`bracket_completed_at` vs round-close vs propagation time).
2. **Free-play reconstruction epoch:** Earliest trustworthy `rating_last_update` / ledger era for O3.
3. **T4 spike go/no-go:** Tournament historical reconstruction vs forward-only disclosure date.
4. **Terminal title doc alignment:** Sovereign Eternal @ 3600+ (product lock) vs existing avatar ladder blocks — prestige docs only.
5. **Floor 100:** Keep unless PO explicitly revises provisional-floor doctrine.
6. **Manual operator finishes:** Include in reconstruction only when rated + complete snapshot (default: same eligibility guards).
7. **D0 persist timing:** When PO signs this map for `docs/` commit — **completed by this document**.

*(Tournament immediate-vs-deferred split without boundary authority and permanent 4000 caps are **not** open PO items — they are locked doctrine / implementation debt.)*

---

## 14. Operational Vercel CLI TLS note

```text
npx vercel whoami
→ failed before authentication
→ npx could not install vercel@latest
→ npm TLS: UNABLE_TO_VERIFY_LEAF_SIGNATURE
```

**Interpretation:** Local certificate / proxy / npm TLS issue — **not** evidence of missing Vercel authentication.

**Use instead:**

- Vercel dashboard
- GitHub commit status API
- Production Playwright probes
- Live bundle markers

Do not troubleshoot TLS in doctrine passes.

---

## 15. Explicit non-implementation status

This document is **doctrine only**. The following are explicitly **not** performed by or implied by this document:

- Product code edits
- SQL apply or migration creation
- Backfill execution
- Profile ticker UI changes
- Stage 3 badge or exact-control infrastructure
- Tournament settlement implementation (T1–T3)
- Free-play ACCL Overall implementation (O1–O3)
- Uncap migration execution (U1–U4)

Implementation begins only through audited rollout slices (O1, O2, O3, T1, T2, T3, T4, U0–U4) after PO-directed engineering passes.
