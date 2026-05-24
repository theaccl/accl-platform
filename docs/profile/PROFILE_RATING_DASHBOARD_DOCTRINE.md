# Profile Rating Dashboard — Doctrine

This document defines how the Profile Rating Dashboard behaves today and how the **rating-history data phase** must extend it. UI may ship incrementally; these rules are non-negotiable for data wiring.

## Core principle: chess stock ticker

The rating chart is **not decorative**. When rating-history data exists:

- The **line** represents rating movement over time.
- Every **break, point, dot, rise, drop, or flat segment** represents an **actual finished rated game**.
- Each plotted point maps **1:1** to a specific game event.

Example sequence:

| Point | Game | Before → After | Result |
|-------|------|----------------|--------|
| 1 | Game A | 1200 → 1216 | Win |
| 2 | Game B | 1216 → 1198 | Loss |
| 3 | Game C | 1198 → 1198 | Draw |
| 4 | Game D | 1198 → 1225 | Win |

Every rise has a game behind it. Every crash has a game behind it. Every recovery, streak, and bucket-specific story must be traceable to real games.

## Do not fake data

Until a read-only rating-history API returns authoritative snapshots:

- Keep **empty states** (current rating context only).
- Do **not** fabricate chart points, sparklines, peaks, or per–time-control splits.
- Do **not** enable clickable game dots or tooltips from synthetic series.
- `buildProfileRatingViewModel` remains a **P1 snapshot adapter only**.

When real data exists, only then wire interactive chart points and expanded tickers.

## Required point metadata

Each `RatingGamePointSnapshot` (see `lib/profile/ratingDashboardTypes.ts`) must include:

| Field | Required | Notes |
|-------|----------|-------|
| `gameId` | yes | Link target for replay / Vault |
| `finishedAt` | yes | ISO timestamp; chart X axis |
| `ratingBucket` | yes | P1 bucket id (e.g. `free_blitz`, `blitz-3-2`) |
| `mode` | yes | `RatingMode` |
| `timeControl` | yes/null | Canonical TC token when applicable |
| `opponentUsername` | yes/null | Display name when public |
| `opponentRating` | optional | When available from snapshot |
| `result` | yes | `win` \| `loss` \| `draw` (player-relative) |
| `ratingBefore` | yes | Rating entering the game |
| `ratingAfter` | yes | Rating after the game; chart Y axis |
| `ratingDelta` | yes | `ratingAfter - ratingBefore` |
| `colorPlayed` | optional | `white` \| `black` when known |
| `openingEco` | optional | Later — ECO / opening name |
| `source` | optional | `free` \| `tournament` when known |

Chart rendering derives from snapshots: X = `finishedAt`, Y = `ratingAfter`. The line connects consecutive games in chronological order within the bucket.

## Desktop behavior (when history exists)

- **Hover** a point → tooltip with game summary (opponent, result, delta, TC, date).
- **Click** a point → open finished game, replay, Vault entry, or game-summary drawer.
- User can inspect exactly which game caused a jump, drop, crash, or recovery.

## Mobile behavior (when history exists)

Phone screens cannot cram a full game-by-game ticker into the profile card.

- Provide **Expand Chart** / **Open Rating Ticker** → larger chart page, modal, drawer, or dedicated screen.
- Expanded view: larger chart, easier-to-tap game dots, readable movement.
- Optional: **one expanded ticker per bucket** (e.g. Blitz overall, Blitz 3+2, Tournament).

Suggested routes (future):

- `/profile/[id]/ratings/[bucketId]/ticker`
- Profile → Blitz Rating → Open Ticker
- Profile → Blitz 3+2 → Open Ticker
- Profile → Tournament Rating → Open Ticker

Expanded ticker view should include:

- Large rating chart with clickable/tappable game points
- Game list below the chart (same ordering as the line)
- Filters: date range, result, source, time control
- Selected-point detail panel
- Link/open to finished game or Vault replay

## Filters (when history exists)

Profile card filters (`RatingPeriodFilter`, `RatingGameFilter`) apply to **game points**, not decorative aggregates:

- Period: `7d` \| `30d` \| `90d` \| `1y` \| `all`
- Game: `all` \| `wins` \| `losses` \| `draws` \| `free` \| `tournament`

Filtered series must still be 1:1 with real games — never interpolate missing points.

## Per–time-control buckets

Child buckets (e.g. Blitz 3+2) show history only when ACCL records **separate** rating movement for that exact time control. Until then, use the existing empty state (`inheritsModeBucket`) — do not inherit parent mode history as fake per-TC points.

## Implementation map

| Layer | Role |
|-------|------|
| `lib/profile/ratingDashboardTypes.ts` | Snapshot + ticker types |
| `lib/profile/ratingHistoryGamePoints.ts` | Validation, chart eligibility, route helpers |
| `lib/profile/buildProfileRatingViewModel.ts` | P1 snapshot only; history filled by future API adapter |
| `components/profile/ratings/RatingHistoryChart.tsx` | Line + game dots when authoritative history present |
| Future API | Read-only per-bucket rating-history snapshots (no rating-math changes in UI) |

## Phase checklist

- [x] Profile card UI + empty states + P1 snapshot
- [x] Game-point data model + doctrine (this document)
- [ ] Read-only rating-history API
- [ ] Chart game dots + desktop tooltip/click
- [ ] Mobile expanded ticker + game list + filters
- [ ] Per–time-control authoritative series
