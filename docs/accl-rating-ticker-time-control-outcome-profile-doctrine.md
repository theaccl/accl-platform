# ACCL Rating Ticker + Time-Control Outcome Profile Doctrine

## 1. Title and status

| Property | Value |
|----------|--------|
| **Document title** | ACCL Rating Ticker + Time-Control Outcome Profile Doctrine |
| **Status** | Docs-only product / UI / data doctrine |
| **Pass type** | Documentation only — no implementation |
| **Migration** | None |
| **Production contact** | None |
| **SQL** | None |
| **Deploy** | None |

This document defines how the **ACCL Rating Ticker** presents time-structured rating history and how the **Time-Control Outcome Profile** projects side-split outcome tendency per official time control. It governs product meaning, visual integration boundaries, eligibility rules, accessibility requirements, and open decisions for future implementation.

**In scope:** ticker time-background doctrine, official time-control inventory, outcome profile semantics, white/black side split, sample-size confidence, eligibility defaults, generator/profile cosmetic integration, accessibility, open decisions.

**Explicitly out of scope (this document):**

- Application code changes
- Unit or integration tests
- Supabase migrations or SQL functions
- Production queries, probes, or deployment
- Pairing, settlement, or rating formula changes
- Avatar Image Generator implementation
- ASI / Lean sandbox work

---

## 2. Rating ticker time-background doctrine

The ACCL Rating Ticker is **not a generic chart**. It is the player’s **time-history surface** — a rating movement line embedded in a background that communicates **when** activity occurred, not merely **how much** rating changed.

### Core principle

Background structure must communicate **time context without overpowering rating movement**. The rating line remains primary; background segmentation is secondary scaffolding.

### Official time-window backgrounds

| Time window | Background structure | Communicates |
|-------------|---------------------|--------------|
| **Day** | **24-hour background structure** | Hour-level or coarse intraday rhythm within the selected calendar day |
| **Week** | **Day-segmented background** | Which days within the week carried activity |
| **Month** | **Week-segmented background** | Weekly rhythm within the month |
| **Year** | **Month / season background** | Seasonal or monthly cadence across the year |
| **Overall** | **Career timeline background** | Long-horizon phases of the player’s rated history |

### Design rules

1. Every selectable time window must have a **meaningful background time structure** — not a flat neutral canvas unless data is absent.
2. Background bands, grids, or labels must remain **lower visual weight** than the rating polyline, points, and delta markers.
3. Background must **not** imply outcome certainty, strength guarantees, or pairing priority.
4. When the selected lane or comparison mode changes (e.g. major family vs exact control), background structure follows the **selected time window**, not the lane identity alone.
5. Empty or sparse windows still show time scaffolding; absence of rating points must not collapse the time metaphor.

---

## 3. Official time-control support

The ticker and outcome profile surfaces must eventually support **all official ACCL time controls** below. These are the canonical live and Daily controls recognized by platform classification doctrine.

### Bullet

| Control |
|---------|
| 1+0 |
| 1+1 |
| 2+0 |
| 2+1 |

### Blitz

| Control |
|---------|
| 3+0 |
| 3+2 |
| 5+0 |
| 5+5 |

### Rapid

| Control |
|---------|
| 10+0 |
| 15+0 |
| 30+0 |
| 60+0 |

### Daily

| Control |
|---------|
| 1 day |
| 2 days |
| 3 days |
| 7 days |

### Grouping note

Major families (Bullet, Blitz, Rapid, Daily) may appear as ticker lanes or comparison families. Exact controls above are the **finest official units** for Time-Control Outcome Profile side-split display when exact-control infrastructure is active.

---

## 4. Time-Control Outcome Profile

### Definition

The **Time-Control Outcome Profile** is a **projected outcome tendency** for a player within a specific official time control — derived from completed rated game history — expressed separately for White and Black.

It answers: *“Given this player’s settled history in this control, how have outcomes tended to fall by side?”*

It does **not** answer: *“How strong is this player in absolute terms?”*

### Preferred label

**Time-Control Outcome Profile**

### Allowed alternate labels

- Side-Split Performance Projection
- Time-Mode Forecast
- White/Black Outcome Tendency

### Forbidden framing

Do **not** call this:

- true strength
- guaranteed result
- certain prediction
- Elo substitute
- pairing authority
- settlement input

The outcome profile is **informational projection**, not rating truth and not a promise of future results.

---

## 5. White / Black side split

For **each official time control**, the profile should eventually expose the following dimensions when data exists:

| Dimension | Description |
|-----------|-------------|
| **Games played** | Total settled rated games in this control |
| **Games as White** | Count seated White |
| **Games as Black** | Count seated Black |
| **Win percentage as White** | Wins / White games |
| **Win percentage as Black** | Wins / Black games |
| **Draw percentage as White** | Draws / White games |
| **Draw percentage as Black** | Draws / Black games |
| **Loss percentage as White** | Losses / White games |
| **Loss percentage as Black** | Losses / Black games |
| **Expected score by side** | Side-specific expected score derived from outcome history (method open; see §10) |
| **Recent trend** | Directional change over an approved recent window (window open; see §10) |
| **Sample-size confidence** | Honest confidence band from game count (see §6) |

### Display rules

1. White and Black splits must remain **visually and semantically distinct**.
2. Side percentages must **sum to 100%** per side (win + draw + loss), excluding unfinished or voided games from the denominator.
3. When one side has zero games, show **explicit empty state**, not fabricated percentages.
4. Recent trend must not override or replace the authoritative rating line on the ticker.

---

## 6. Sample-size confidence

Outcome projections must **not be fabricated from weak data**. When sample size is insufficient, the UI must say so plainly.

### Suggested confidence bands

| Games in control | Confidence label | Display posture |
|------------------|------------------|-----------------|
| **0–4** | Not enough data | Suppress percentages or show “Not enough data”; no trend arrow |
| **5–14** | Low confidence / early trend | Show values with low-confidence label; optional muted visuals |
| **15–49** | Medium confidence | Standard display with medium-confidence label |
| **50+** | Higher confidence | Standard display with higher-confidence label |

### Doctrine rules

1. **Never** extrapolate win/draw/loss percentages from fewer than **5** settled games unless an explicit future PO decision lowers the floor — default remains **5 minimum** for any percentage display.
2. **Never** present trend arrows or “specialty” callouts at **0–4** games.
3. Confidence must appear in **text**, not color alone (see §9).
4. Cross-control comparison (“strongest time mode”) must respect confidence — a 6-game Bullet spike must not outrank a 120-game Blitz profile without labeling the disparity.

---

## 7. Eligibility / data-source rules

### Default source

Unless later approved otherwise by server-side doctrine, the Time-Control Outcome Profile and ticker history points must derive from:

**Completed rated human games only** — with authoritative settlement recorded in the platform rating ledger.

### Exclude by default

| Category | Default |
|----------|---------|
| Active / in-progress games | Exclude |
| Unfinished Daily games | Exclude |
| Bot games | Exclude |
| Trainer games | Exclude |
| Standalone puzzles | Exclude |
| Analysis-only sessions | Exclude |
| Imported games | Exclude unless explicitly approved |
| Games without authoritative settlement | Exclude |
| Voided / superseded / lifecycle-void finishes | Exclude |

### Tournament inclusion

**Open decision.** Tournament rated games may eventually feed outcome profiles separately, merged, or excluded. Until decided:

- Do not silently merge tournament and free-play outcome pools without labeled separation.
- Ticker lanes that represent major families must document whether tournament rows are included when the decision lands.

### Relationship to rating truth

The **server-side rating ledger** remains authoritative for rating movement. Outcome profile aggregates are **derived presentation** and must recomputed from the same eligible game set doctrine approves — not from client-side inference.

---

## 8. Generator / profile visual integration

Outcome profile and ticker selections may inform **informational / cosmetic** profile and generator presentation only.

### Possible future uses (non-authoritative)

- Time-control specialty badges
- Side-specific visual marker (White vs Black tendency hint)
- Strongest time-mode highlight
- Ticker background tied to selected time window
- Preferred arena / time-control identity card on public profile

### Locked boundaries

| Rule | Status |
|------|--------|
| Generator visuals **do not redefine rating truth** | Locked |
| Server-side rating ledger remains **authoritative** | Locked |
| Outcome profile **does not affect pairing** unless later approved | Locked |
| Outcome profile **does not affect eligibility** unless later approved | Locked |
| Outcome profile **does not affect settlement** unless later approved | Locked |
| Outcome profile **does not affect rating apply** unless later approved | Locked |

Cosmetic generator output may **reflect** tendencies; it may not **write** or **override** rating state.

---

## 9. Accessibility

All ticker and outcome profile surfaces must satisfy the following accessibility doctrine:

| Requirement | Rule |
|-------------|------|
| **Non-color-only indicators** | Outcome tendency, trend, and confidence must not rely on color alone |
| **Text equivalents for charts** | Provide tabular or screen-reader text summary for chart data |
| **Reduced-motion mode** | Respect platform reduced-motion preference; disable non-essential animation |
| **Readable labels** | Use full words (“Win rate as White”) not icon-only tooltips |
| **Confidence in text** | Confidence band must appear as readable text (“Low confidence — 8 games”) |

Accessibility is part of product truthfulness: a projection users cannot perceive equitably is not an acceptable projection.

---

## 10. Open decisions

The following items require PO / server-side doctrine resolution before implementation locks:

| # | Open decision |
|---|---------------|
| 1 | **Lifetime vs recent-window projections** — career-all vs rolling window |
| 2 | **Default projection window** — e.g. last 30 / 90 / 365 days |
| 3 | **Rated-only vs rated + unrated** — default is rated-only; unrated inclusion TBD |
| 4 | **Tournament inclusion or separation** — merged profile vs isolated tournament profile |
| 5 | **Bot / Trainer** — separate profile bucket vs hard exclude |
| 6 | **Local time vs UTC vs platform time** — day/week/month boundary authority |
| 7 | **Win percentage vs expected score** — primary display metric |
| 8 | **Confidence method** — fixed bands (§6) vs statistical interval |
| 9 | **K–12 visibility differences** — whether outcome profile fields differ for minor accounts |
| 10 | **Daily visual separation** — whether Daily controls visually separate from live (Bullet/Blitz/Rapid) in ticker and profile |

No open decision may be silently defaulted in implementation without updating this doctrine.

---

## 11. Final doctrine confirmations

| Confirmation | Status |
|--------------|--------|
| The ticker is **not** a generic chart | Confirmed |
| The ticker is the player’s **time-history surface** | Confirmed |
| Every time window has **meaningful background time structure** | Confirmed |
| Every official time control can eventually show **side-split outcome tendency** | Confirmed |
| Outcome profile is **not guaranteed strength** | Confirmed |
| Weak sample sizes must be **labeled honestly** | Confirmed |
| Generator / profile use is **informational / cosmetic** | Confirmed |
| **No code** was written for this doctrine pass | Confirmed |
| **No SQL** was run | Confirmed |
| **No migration** was created | Confirmed |
| **No production contact** occurred | Confirmed |

---

*End of doctrine — docs-only pass.*
