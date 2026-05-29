# ACCL Badge Phase 1 Consolidated Registry & Implementation Spec

**Version:** 1.0 (consolidated)  
**Status:** Registry / doctrine only — no implementation in this document  
**Sources merged:** ACCL Badge System Architecture Audit & Product Spec v0.1 · ACCL Badge Visual Design Brief v0.1 · Phase 1 correction audit (production caller, ledger handoff, codebase alignment)

**Authority order (when sources conflict):**

1. Production SQL behavior and locked migrations (rating classifiers, ledger, `apply_free_play_rating_update_core`)
2. This consolidated spec
3. Superseded v0.1 prose where it disagrees with (1)

---

## 1. Canonical Badge Track Registry

Internal identifiers use **snake_case**. Track keys are **not** asset filenames (see §6).

### 1.1 Key namespaces

| Namespace | Prefix / pattern | Phase | Settles in DB today |
|-----------|------------------|-------|---------------------|
| Free-play mode (umbrella) | `bullet`, `blitz`, `rapid`, `daily` | Documented; math **pending** (§10) | **No** |
| Free-play exact | `{mode}_{tokens}` (below) | Phase 1 settlement target | **Yes** (when real settlement active) |
| Tournament | `tournament_{scope}_{...}` | Pattern only | **No** (Phase 7) |
| Achievement | `achievement_{slug}` | Pattern only | **No** |
| Vault artifact | `vault_{origin}_{slug}` | Pattern only | **No** (Phase 5) |

**Rule:** Free-play exact keys must never be reused for tournament or achievement IDs.

### 1.2 Free-play mode (umbrella) — reserved, not implemented

| `track_key` | Mode | Maps to P1 mode bucket (reference) | Maps to ledger mode `rating_track_id` (reference) |
|-------------|------|-----------------------------------|-----------------------------------------------------|
| `bullet` | Bullet | `free_bullet` | `free_bullet` |
| `blitz` | Blitz | `free_blitz` | `free_blitz` |
| `rapid` | Rapid | `free_rapid` | `free_rapid` |
| `daily` | Daily | `free_day` | `free_day` |

Umbrella rows in `player_badge_state` are **forbidden** until product decision **U1** (§10) is closed.

### 1.3 Free-play exact — official Phase 1 (16 clocks)

| `track_key` | Display clock | PLAT / stored token | Ledger `rating_track_id` | `badge_track_key` on ledger |
|-------------|---------------|---------------------|--------------------------|-----------------------------|
| `bullet_1_0` | 1+0 | `1m` | `free_bullet_1_0` | `bullet_1_0` |
| `bullet_1_1` | 1+1 | `1+1` | `free_bullet_1_1` | `bullet_1_1` |
| `bullet_2_0` | 2 | `2m` / `2+0` | `free_bullet_2_0` | `bullet_2_0` |
| `bullet_2_1` | 2+1 | `2+1` | `free_bullet_2_1` | `bullet_2_1` |
| `blitz_3_0` | 3+0 | `3m` | `free_blitz_3_0` | `blitz_3_0` |
| `blitz_3_2` | 3+2 | `3+2` | `free_blitz_3_2` | `blitz_3_2` |
| `blitz_5_0` | 5+0 | `5m` | `free_blitz_5_0` | `blitz_5_0` |
| `blitz_5_5` | 5+5 | `5+5` | `free_blitz_5_5` | `blitz_5_5` |
| `rapid_10_0` | 10 | `10m` | `free_rapid_10_0` | `rapid_10_0` |
| `rapid_15_0` | 15 | `15m` | `free_rapid_15_0` | `rapid_15_0` |
| `rapid_30_0` | 30 | `30m` | `free_rapid_30_0` | `rapid_30_0` |
| `rapid_60_0` | 60 | `60m` | `free_rapid_60_0` | `rapid_60_0` |
| `daily_1_day` | 1 day | `1d` | `free_daily_1d` | `daily_1_day` |
| `daily_2_day` | 2 days | `2d` | `free_daily_2d` | `daily_2_day` |
| `daily_3_day` | 3 days | `3d` | `free_daily_3d` | `daily_3_day` |
| `daily_7_day` | 7 days | `7d` | `free_daily_7d` | `daily_7_day` |

**Classification source of truth (locked):** SQL `classify_free_badge_track_key(tempo, live_time_control)` — must stay aligned with `lib/badgeTracks.ts`. Do not reimplement via legacy six-bucket classifiers.

### 1.4 Legacy exact (readable, not official creation)

| `track_key` | Notes |
|-------------|--------|
| `rapid_20_0` | Legacy PLAT `20m`; may appear in history and ledger maps |
| `daily_5_day` | Legacy PLAT `5d`; hidden from official Profile ticker grid |

These keys exist in code/SQL maps for **read/backfill only**. New games must not offer them as official creation options.

### 1.5 Tournament — naming pattern only (Phase 7)

**Pattern:** `tournament_{tournament_id}` or `tournament_{season_slug}_{scope}`

**Examples (illustrative, not registered):**

- `tournament_unified` (aligns with P1 `tournament_unified` bucket / ledger `tournament` track)
- `tournament_{uuid}` for per-event campaign medal

**Rules:**

- Never collide with free-play `track_key` strings
- Settlement and Vault linking defined in Phase 7
- Do not allocate final event keys in Phase 1

### 1.6 Achievement — naming pattern only

**Pattern:** `achievement_{category}_{slug}`

**Examples (illustrative):**

- `achievement_streak_milestone_10`
- `achievement_fair_play_commendation`

Achievement badges are **not** rating-driven; they do not use `settlement_rating` rules from free-play exact settlement.

### 1.7 Vault artifact — naming pattern only (Phase 5)

**Pattern:** `vault_{origin_type}_{origin_id}_{variant}`

**Examples (illustrative):**

- `vault_badge_peak_blitz_5_5_2026`
- `vault_relic_tournament_platinum_run`

Links to origin badge event / ledger row / game id in metadata — not a live `track_key` for settlement.

---

## 2. Badge Family Registry

A **family** describes presentation scope and lifecycle rules. A **track_key** (§1) is the data identifier inside a family where applicable.

| Family | `family` slug | Purpose | Shape (visual) | Primary surfaces | State changes | Vault eligible | Driver |
|--------|---------------|---------|----------------|------------------|---------------|----------------|--------|
| **Global** | `global` | Platform identity / account-level heraldry | Heater shield (heraldic) | Profile header (future), account | peak, legacy, retired | Yes (origin) | Mixed; mostly achievement/admin |
| **Tournament** | `tournament` | Campaign / event performance | Medallion / campaign medal | Tournament pages, Profile tournament card, finished event | normal → material tier; settled | Yes | Tournament result + bracket settlement |
| **Free mode (umbrella)** | `free_mode` | Mode-level reputation (umbrella) | Rook tower crest | Profile mode card (umbrella slot) | All exact states **if** umbrella implemented | Yes | **Pending** rating model (§10) |
| **Exact time-control** | `exact_time_control` | Per-clock skill badge (Phase 1 core) | Octagonal coin | Profile subtracks, game finished summary, ticker markers | normal, shiny, downgraded, recovery | Yes | Rating + badge settlement on exact track |
| **Achievement** | `achievement` | Milestones, fair play, streaks | Laurel wreath frame | Profile achievements strip, notifications | created, retired, legacy_marked | Yes | Achievement rules engine |
| **Vault artifact** | `vault_artifact` | Frozen relic of a past badge moment | Relic plate / fractured coin | Vault gallery only | immutable snapshot | N/A (is Vault) | Promotion from earned badge |

**Phase 1 implementation scope:** `exact_time_control` family only for live settlement. Other families are registry + visual direction only.

**Cross-family rule:** Tournament and free-play must not share the same `track_key` string. Profile Rating Ticker continues to use ledger + `player_badge_state` for exact tracks only (locked).

---

## 3. Badge State Enum

### 3.1 Canonical display / persistence states

| State | Meaning | Backend `visual_state` (exact track today) | Ledger `badge_state_*` (Profile/ticker) |
|-------|---------|---------------------------------------------|----------------------------------------|
| **normal** | Standard band presentation | `normal` | `normal` |
| **shiny** | Promoted visual (win-streak / upgrade) | `upgraded` | `shiny` |
| **downgraded** | Confirmed demotion visual | `downgraded` | `downgraded` |
| **recovery** | Actively repairing from downgraded | *pressure workflow* (`demotion_armed` / repair path) | `recovery` (ledger) or mapped from pressure |
| **peak** | Highest band achieved on track (retained) | `peak_rank_band` column | metadata / future event |
| **retired** | No longer earned; historical | — | — |
| **legacy** | Pre-migration or deprecated control | — | — |

**Mapping rule (locked UI path):** `visual_state = upgraded` ↔ display **shiny** (`lib/profileBadgeBoundary.ts`). Do not rename DB column to `shiny` without migration plan.

### 3.2 Pressure substates (exact track — settlement math)

Not separate “badge types” but drive events and borders:

| `pressure_state` | Meaning |
|------------------|---------|
| `stable` | No armed promotion/demotion |
| `promotion_armed` | On rise toward upgrade |
| `demotion_armed` | In demotion danger band |

### 3.3 Rank band (tier axis — exact + future umbrella)

Bands: `f`, `e`, `d`, `c`, `b`, `a`, `expert`, `master`, `elite`  
Lower borders from `accl_badge_rank_bands` / `BADGE_RANK_BAND_LOWER_BORDER` (1000–2400).  
Demotion danger: **lower_border − 25** (locked in code/SQL today).

### 3.4 State support by family

| State | global | tournament | free_mode | exact_time_control | achievement | vault_artifact |
|-------|--------|------------|-----------|-------------------|-------------|----------------|
| normal | ✓ | ✓ | ✓ (pending) | ✓ | ✓ | snapshot |
| shiny | ○ | ○ | ○ | ✓ | ○ | snapshot |
| downgraded | ○ | ○ | ○ | ✓ | ○ | snapshot |
| recovery | ○ | ○ | ○ | ✓ | ○ | snapshot |
| peak | ✓ | ✓ | ✓ | ✓ | ✓ | snapshot |
| retired | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| legacy | ✓ | ✓ | ○ | ✓ (legacy clocks) | ✓ | ✓ |

✓ = supported in doctrine · ○ = optional / Phase 7+ · snapshot = frozen at Vault creation

---

## 4. Badge Event Enum

### 4.1 Product / audit event types (normative for `player_badge_event_history`)

| `event_type` | Description | Typical family | Maps from settlement (today) |
|--------------|-------------|----------------|------------------------------|
| `created` | First state row for track | exact, achievement | implicit on first settle |
| `promoted` | Rank band increased | exact, free_mode | `promotion_upgrade` |
| `downgraded` | Visual demotion confirmed | exact | `demotion_confirmed` |
| `shiny_earned` | Shiny attained | exact | `streak_upgrade` |
| `shiny_revoked` | Shiny lost on defeat | exact | `upgrade_lost_on_defeat` |
| `recovery_started` | Entered recovery path | exact | `demotion_armed` |
| `recovery_resolved` | Back to normal visual | exact | `demotion_pressure_cleared`, `downgrade_repaired` |
| `peak_recorded` | New peak band stored | all rating-driven | peak_rank_band update |
| `retired` | Badge retired from active | any | admin/product |
| `legacy_marked` | Marked legacy control | exact | migration |
| `vault_artifact_created` | Copied to Vault | vault_artifact | Vault pipeline |
| `tournament_settled` | Bracket/event settlement | tournament | Phase 7 |

### 4.2 Settlement-layer events (implementation — `settle_player_badge_state`)

Keep for Phase 3 SQL/TS parity:

`none` · `demotion_armed` · `demotion_confirmed` · `demotion_pressure_cleared` · `downgrade_repaired` · `streak_upgrade` · `promotion_upgrade` · `upgrade_lost_on_defeat`

**Mapping to ledger `badge_event`:** use `map_badge_event_to_ledger` (e.g. `streak_upgrade` → `shiny_earned`). Profile ticker uses ledger/profile enum (`BadgeEvent`).

### 4.3 Ledger write authority

Badge settlement **must not** INSERT into `player_rating_history_ledger`.  
Ledger rows are appended only by `append_rating_history_ledger_for_game_apply` after settlement returns `badge` snapshot.

---

## 5. Visual Design Registry

**Art direction:** Forged Metal / Dark Chess Relic — weight, permanence, tactile metal, low-saturation backgrounds.

### 5.1 Family → form factor

| Family | Form | Notes |
|--------|------|--------|
| global | Heraldic **heater shield** | Account/platform tier |
| tournament | **Medallion** / campaign medal | Ribbon optional; event name on reverse in lore |
| free_mode | **Rook tower crest** | Mode-colored enamel |
| exact_time_control | **Octagonal coin** | Clock token on face; tier = material |
| achievement | **Laurel wreath** frame | Center icon per achievement category |
| vault_artifact | **Relic plate** / fractured coin | Wear, crack, patina |

### 5.2 Mode palette (free_mode + exact)

| Mode | Primary palette | Motif |
|------|-----------------|-------|
| Bullet | Deep crimson | Knight |
| Blitz | Electric amber | Clock |
| Rapid | Teal / slate | Rook |
| Daily | Forest green | Board corner |

Exact coins inherit parent mode palette + clock label.

### 5.3 Tier material progression (exact + tournament visual)

Ordered materials: **Iron → Bronze → Silver → Gold → Platinum → Diamond → Obsidian**

Maps to rank bands (`f`..`elite`) per tier boundary table (§10 — must be generated from current rating model doc).

**Product decision pending (not locked):** Tournament medallion material floor starts at **Silver** — document as **U7**, not implementation default.

### 5.4 State overlays (exact coin)

| State | Visual treatment |
|-------|------------------|
| normal | Base material for band |
| shiny | Polished edge glow, specular highlight |
| downgraded | Crack/chip overlay, dull finish |
| recovery | Mended crack, dim inner glow |
| peak | Small crown/gem inset on rim |
| retired | Desaturated + stroke “archived” |
| legacy | Patina + “legacy” mark |

### 5.5 K-12 / public downgrade visibility

**Pending (U8):** Downgraded state may use softened public copy or limited surfacing — spec allows “recovery_needed” boundary without harsh public label until policy final.

---

## 6. Asset Naming Registry

**Separation:** `track_key` (data) ≠ `asset_slug` (files).

### 6.1 Filename convention

```text
badge_{family}_{category}_{variant}_{state}.svg
```

- **family:** `global` | `tournament` | `mode` | `exact` | `achievement` | `vault`
- **category:** mode name or clock slug (no underscores in clock — use rules below)
- **variant:** tier material slug (`iron`, `bronze`, … `obsidian`) or `campaign_{slug}`
- **state:** `normal` | `shiny` | `downgraded` | `recovery` | `peak` | `retired` | `legacy`

**No special characters in filenames.** Translate:

| Character | File slug |
|-----------|-----------|
| `+` | `p` |
| spaces | omit |
| daily days | `1d`, `2d`, `3d`, `7d` |

### 6.2 Examples

| Internal `track_key` | `asset_slug` | Example file |
|--------------------|--------------|--------------|
| `blitz_5_5` | `5p5` | `badge_exact_blitz_5p5_gold_normal.svg` |
| `bullet_1_0` | `1p0` | `badge_exact_bullet_1p0_silver_shiny.svg` |
| `daily_7_day` | `7d` | `badge_exact_daily_7d_bronze_normal.svg` |
| `blitz` (umbrella) | `blitz` | `badge_mode_blitz_platinum_normal.svg` (future) |

### 6.3 Registry tables (optional, Phase 2+)

`badge_asset_registry`: `track_key`, `family`, `asset_slug`, `tier`, `state`, `file_path`, `version`  
Allows CDN refresh without changing `track_key`.

---

## 7. Corrected Function Contract

### 7.1 Frozen signature (production caller)

```sql
apply_free_play_badge_settlement(
  p_game_id uuid,
  p_rating_snapshot jsonb
) returns jsonb
```

**Caller (locked):** `apply_free_play_rating_update_core(p_game_id)` invokes:

```text
v_badge := apply_free_play_badge_settlement(p_game_id, out);
v_ledger := append_rating_history_ledger_for_game_apply(p_game_id, out, v_badge);
```

Do **not** change to `(p_player_id, …)` unless core is explicitly migrated and tested.

### 7.2 Shim vs real implementation

| Condition | Behavior |
|-----------|----------|
| Real function from `20260619120000` present | Settles `player_badge_state`; returns `applied: true` when eligible |
| Compat shim from `20260619170000` | `applied: false`, `reason: badge_settlement_function_missing_compat_shim` — **never** fake events |

Phase 3 replaces shim by ensuring real body exists — **not** by changing signature.

### 7.3 Required behavior (real function)

1. `SELECT` game by `p_game_id`; fail `game_not_found`
2. Require `play_context = free`, `rated = true`
3. Derive `track_key` = `classify_free_badge_track_key(tempo, live_time_control)`; fail `unsupported_track`
4. Derive white/black from game row; result per player from `games.result`
5. Read rating deltas from `p_rating_snapshot` (`p1_white` / `p1_black`, legacy fallbacks)
6. Load prior `player_badge_state` per player + `track_key`; run `settle_player_badge_state`
7. **Read** ledger: confirm mode-scope (and after enhancement, exact-scope) rows exist for this `game_id` before emitting audit `events[]` with `trigger_ledger_row_id`
8. **Never** INSERT into `player_rating_history_ledger`
9. Idempotency: if game already badge-settled at apply layer → `applied: false`, `reason: already_settled` (see §9)
10. **Never** fabricate `events[]` or `applied: true` without state writes

### 7.4 Target return shape

```json
{
  "applied": true,
  "reason": "ok",
  "track_key": "blitz_5_5",
  "events": [
    {
      "player_id": "uuid",
      "track_key": "blitz_5_5",
      "event_type": "shiny_earned",
      "settlement_event_type": "streak_upgrade",
      "from_visual_state": "normal",
      "to_visual_state": "upgraded",
      "trigger_game_id": "uuid",
      "trigger_ledger_row_id": "uuid",
      "idempotency_key": "player:…:track:blitz_5_5:game:…:event:shiny_earned"
    }
  ],
  "white": { "ticker fields / summary" },
  "black": { "ticker fields / summary" }
}
```

**Reason codes:** `ok` | `already_settled` | `game_not_found` | `not_free_play` | `unrated` | `unsupported_track` | `not_eligible` | `missing_ledger_row` | `badge_settlement_function_missing_compat_shim`

Current foundation JSON uses `white` / `black` ticker objects without top-level `events[]` — Phase 3 adds `events[]` without breaking signature.

---

## 8. Proposed Tables (draft — no migrations in Phase 1)

### 8.1 `player_badge_state` (exists in repo foundation)

**Status:** Defined in `20260619120000_free_play_badge_settlement_foundation.sql`. Phase 2 may extend columns; Phase 1 spec does not duplicate migration.

| Column | Role |
|--------|------|
| `(user_id, track_key)` PK | Exact track state |
| `settlement_rating` | Badge math rating (≠ P1 mode rating) |
| `active_rank_band` | Current band |
| `visual_state` | normal / upgraded / downgraded |
| `pressure_state` | stable / promotion_armed / demotion_armed |
| `pressure_border` | Recovery/demotion border |
| `win_streak` | Streak counter |
| `peak_rank_band` | Peak record |
| `last_game_id` | Last settle game (weak idempotency hint) |
| `updated_at` | Audit |

**Phase 1 keys:** exact `track_key` only (§1.3).

### 8.2 `player_badge_event_history` (proposed)

Append-only audit of state transitions.

| Column | Required |
|--------|----------|
| `id` | PK |
| `user_id`, `track_key` | ✓ |
| `event_type` | §4.1 |
| `trigger_game_id` | ✓ |
| `trigger_ledger_row_id` | ✓ (nullable only until append returns IDs) |
| `idempotency_key` | ✓ UNIQUE |
| `from_*` / `to_*` visual and pressure | optional detail |
| `settlement_rating_before` / `after` | optional |
| `metadata` | jsonb |
| `created_at` | ✓ |

Written by settlement **after** state upsert; **not** by ledger append.

### 8.3 `badge_track_registry` (optional)

Static catalog: `track_key`, `family`, `mode`, `official`, `legacy`, `ledger_rating_track_id`, `asset_slug`, `active`.

### 8.4 `badge_asset_registry` (optional)

Maps `track_key` + tier + state → asset file path / version.

---

## 9. Idempotency Rules

### 9.1 Game-level (primary)

Rating apply owns single finish:

- `games.rating_applied = true` → do not re-run settlement; return `applied: false`, `reason: already_settled`
- Aligns with `apply_free_play_rating_update_core` concurrent apply guard

### 9.2 Event-level key (normative)

```text
idempotency_key = hash or canonical string:
  player_id + track_key + trigger_game_id + event_type
```

Example:

```text
player:{uuid}:track:blitz_5_5:game:{uuid}:event:shiny_earned
```

Duplicate insert → skip event; surface `already_settled` at function level if no work performed.

### 9.3 Ledger-level (existing, locked)

Unique index `uniq_rating_history_game_track` on `(player_id, rating_track_id, game_id)` where `event_type = 'game'`.

Badge settlement must not bypass this with a second writer.

### 9.4 Required fields for any badge event record

No badge event may persist without:

- `player_id`
- `track_key`
- `trigger_game_id`
- `trigger_ledger_row_id` (required once append layer returns IDs; until then settlement must not claim audit events that require it)
- `event_type`
- `idempotency_key`

### 9.5 Duplicate call semantics

```json
{ "applied": false, "reason": "already_settled" }
```

No duplicate `player_badge_event_history` rows for same idempotency key.

---

## 10. Open Product Decisions

| ID | Topic | Options / notes |
|----|--------|-----------------|
| **U1** | Umbrella mode badge rating | Highest active exact `settlement_rating` · current mode ledger rating · weighted average · most-played track · separate mode-only rating |
| **U2** | Shiny threshold | **Proposed default: 5 wins** — not final |
| **U3** | Recovery threshold | **Proposed default: 3 wins** after downgraded — not final |
| **U4** | Exact tier boundaries | Must publish table from `accl_badge_rank_bands` + danger (−25) + streak rules; sync with Profile boundary panel |
| **U7** | Tournament medal material floor | **Proposed: Silver floor** — not locked |
| **U8** | K-12 public downgrade visibility | Likely softened/limited copy — policy pending |
| **U9** | `trigger_ledger_row_id` strictness | Block `events[]` until append returns row IDs vs allow null in transition |
| **U10** | Draw / zero-delta behavior | Locked in code today: no promo/demotion confirm; streak does not advance on draw |

---

## 11. Non-Overlap Guardrails

Do **not** modify in Badge Phase 1–3 workstreams without explicit program approval:

| Locked surface | Reason |
|----------------|--------|
| `classify_rating_bucket` | Production parity (`20260619171000`) |
| `classify_p1_rating_bucket` | P1 dual-write |
| `classify_free_badge_track_key` | Exact track resolution |
| `apply_free_play_rating_update_core` | Signature + ledger ordering |
| `player_rating_history_ledger` schema | Ticker + backfill + idempotency |
| `append_rating_history_ledger_for_game_apply` | Sole ledger writer |
| Profile Rating Ticker math / components | Closed (`970d649` chain) |
| Avatar WIP | Separate program |
| Active game board layout (`55ffd42`) | Mobile HUD |
| Tournament enforcement logic | Phase 7 |

**Do not:**

- Insert ledger rows inside `apply_free_play_badge_settlement`
- Replace compat shim in a drive-by migration without Phase 3 plan
- Mix tournament `track_key` into free-play settlement
- Stage avatar or operator script files in badge commits

---

## 12. Implementation Phases

| Phase | Deliverable | This document |
|-------|-------------|---------------|
| **1** | Registry / spec consolidation (this file) | ✓ Current |
| **2** | Badge state schema hardening + optional registry tables | Extend `player_badge_state`; add `player_badge_event_history` |
| **3** | Real `apply_free_play_badge_settlement` (preserve signature) | Activate `20260619120000` body; retire shim; add `events[]` |
| **4** | Profile badge display | Read-only UI; exact family coins; no ticker math rewrite |
| **5** | Vault origin linking | `vault_*` keys + `vault_artifact_created` |
| **6** | Asset production | §6 filenames; tier materials |
| **7** | Tournament badge settlement | §1.5 patterns; medallion family |

---

## 13. Stop Conditions

Stop and escalate **before** implementation if:

| # | Condition | Current status (audit) |
|---|-----------|------------------------|
| 1 | `track_key` conflicts with existing SQL/TS names | **Clear** — official 16 ⊆ registry; legacy extras documented |
| 2 | Function signature would change | **Clear** — must stay `(uuid, jsonb)` |
| 3 | Ledger rows cannot be linked per game | **Clear** when `badge.applied=true` and append runs |
| 4 | Badge settlement would write ledger directly | **Violation** if proposed — use append handoff only |
| 5 | Avatar WIP in `git status` | **Present** — keep badge branches clean |
| 6 | Profile ticker or rating classifiers would be modified | **Forbidden** by guardrails |
| 7 | `trigger_ledger_row_id` required but append returns no IDs | **Gap** — resolve in Phase 2/3 append enhancement before strict audit events |

---

## Appendix A — Mode / umbrella decision matrix (documentation only)

| Option | Pros | Cons |
|--------|------|------|
| Highest active exact `settlement_rating` | Simple, rewards best clock | Ignores volume on other clocks |
| Current umbrella mode ledger rating | Aligns with P1 mode row | May diverge from per-clock skill |
| Weighted average of exact tracks | Smooth umbrella | Complex, opaque |
| Most-played track | Reflects habit | Disadvantages multi-mode players |
| Separate mode-only rating | Clean separation | Extra rating surface |

**Decision:** **U1 pending** — no implementation.

---

## Appendix B — Consolidation changelog (v0.1 → v1.0)

| Topic | v0.1 risk | v1.0 resolution |
|-------|-----------|-----------------|
| Function args | `p_player_id` first | **`p_game_id` + `p_rating_snapshot` frozen** |
| Umbrella math | Stated as highest active | **Marked pending (U1)** |
| Ledger writes | Unclear ownership | **Append-only via `append_rating_history_ledger_for_game_apply`** |
| Shiny naming | Mixed shiny/upgraded | **State table §3.1** |
| Tournament Silver floor | Sometimes locked | **U7 pending** |
| Visual families | Scattered | **§2 + §5 registry** |
| Asset files | Ad hoc | **§6 convention** |

---

## Appendix C — Visual Anchor Concepts v1

**Status:** Docs-only direction. Accepted polished concept exploration (Manus). **None of these are final production assets.** Source exploration: `ACCL_Anchor_Badge_Polished_Concept_Explorations.pdf` (external reference; not stored as a production asset).

### C.1 Gold Global ACCL Shield

- **Shape:** heraldic heater shield
- **Material:** forged gold
- **Purpose:** official ACCL identity badge
- **ACCL micro-mark:** central and protected
- **No globe** as primary symbol
- Maps to family `global` (§2) / heater-shield form (§5.1)
- **Not a final production asset**

### C.2 Blitz 5+5 Exact Time-Control Badge — State Set

- **Shape:** octagonal forged plate
- **Mode:** Blitz (electric amber / gold rim, per §5.2)
- **Symbol:** one simplified chess clock
- **5+5 detail:** large-size-only
- **ACCL micro-mark:** protected in lower notch
- Maps to family `exact_time_control` (§2), `track_key = blitz_5_5`, `asset_slug = 5p5` (§6)
- **States:**
  - **normal:** clean forged plate, no glow
  - **shiny:** contained reflective highlight sweep
  - **downgraded:** full color / full size, one clean scar, ACCL mark untouched
  - **recovery:** same scar sealing with controlled forge-glow
  - **peak:** outer historic frame / aura (not a shiny reflection)
- **Not a final production asset**

### C.3 Vault Codex / Tablet Artifact

- **Shape:** broken codex / tablet / keystone fragment (**not a coin**)
- **Purpose:** archived game relic
- **Wear language:** archival chips / patina, **not active damage**
- **ACCL micro-mark:** the clearest preserved element
- Maps to family `vault_artifact` (§2) / relic-plate form (§5.1)
- **Not a final production asset**

### C.4 Production warnings

- **Do not** trace generated images directly into production.
- Rebuild as **layered SVGs**.
- Generated metal texture / patina is **direction only**.
- The **ACCL micro-mark needs an official vector definition** before any asset ships.
- State overlays must be **reusable layers**, not hand-rendered one-offs.
- Vault break silhouette needs a **simplified small-size variant**.

### C.5 Recommended SVG layer model

**Gold Global shield**
1. base heater shield silhouette
2. outer gold rim
3. inner inset plate
4. protected ACCL micro-mark
5. highlight layer
6. optional patina / noise layer
7. small-size simplified variant

**Blitz 5+5**
1. base octagonal plate
2. amber rim
3. clock glyph
4. optional 5+5 text layer (gated by size)
5. protected ACCL micro-mark
6. state overlay layers:
   - shiny reflection
   - downgrade scar
   - recovery forge-glow
   - peak outer frame / aura

**Vault artifact**
1. base codex / tablet silhouette
2. chipped-edge mask
3. inner border grooves
4. protected ACCL micro-mark
5. subtle relic engraving layer
6. patina / noise layer
7. small-size simplified fragment variant

### C.6 Left open (no decision in v1)

- Final ACCL micro-mark geometry
- Final SVG dimensions
- Exact tier material palette (relates to §5.3 Iron→Obsidian and U7)
- Exact small-size variants
- Whether generated concept images are stored in docs or only referenced externally

---

*End of ACCL Badge Phase 1 Consolidated Registry & Implementation Spec*
