# Free-play validation matrix

Use two real accounts (same as E2E env: `E2E_USER_*` and `E2E_USER_B_*`). Automation lives in `tests/functional/free-play-validation.spec.ts`, `tests/functional/queue-match-free.spec.ts`, `tests/functional/direct-challenge.spec.ts`, and `tests/functional/direct-challenge-no-premature-game.spec.ts`.

| Area | Automated | Manual steps (if env unavailable) | Expected |
|------|-----------|-------------------------------------|----------|
| Random match: open seat | Yes | A: `/free` → Find Match → `/game/:id`. A: back to `/free`. | `WAITING FOR OPPONENT` on the open-seat row; **no** `game-ready-banner`; **no** `free-primary-game`. |
| Random match: pair | Yes | B: `/free` → Find Match. | Same `gameId` as A; **one** board. |
| After pair: /free UI | Yes | A/B: `/free` reload. | Exactly one `free-primary-game`; same game **not** duplicated in `free-active-game-row-*`; **no** ghost ready banner. |
| Find Match guard | Yes | A+B paired; A on `/free` with primary strip → Find Match. | Redirect to **existing** `/game/:id`, no new queue row. If multiple `active` rows exist, **board-ready** (two seats) wins over a newer open seat (`pickExistingActiveGameForRedirect`). |
| Direct challenge pending | Yes | A sends challenge from `/free`; B on `/free`. | B sees `INCOMING REQUEST`, not `WAITING FOR OPPONENT` (no game row for the invite). |
| Direct challenge accept | Yes | B accepts on `/requests` (see `liveChallengePair`). | One game; both on `/game/:id`; realtime redirect on accept. |
| Accept + refresh | Yes | Both on game; then `/free` reload and `/game/:id` reload. | `free-primary-game` visible; URL stable; no removed ready banner. |
| Outgoing + seated table | Yes | A: pending challenge to B; A+B Find Match without accepting challenge. A: `/free` reload. | `free-primary-game` + outgoing card with “Not your current table”. |
| Open seat vs request chrome | Partial | Compare “Active Games” waiting row vs “Incoming” card. | Waiting uses amber **WAITING FOR OPPONENT**; requests use **INCOMING REQUEST** / purple stripe. |

## Commands

```bash
# Unit helpers only (no dev server)
set PLAYWRIGHT_SKIP_WEBSERVER=1
npx playwright test tests/unit/freePlayLobby.spec.ts

# Two-user flows (needs app + Supabase + four env vars)
# Prefer workers=1 for functional/ when the same two accounts are reused across files:
npx playwright test tests/functional/free-play-validation.spec.ts --workers=1
npx playwright test tests/functional/direct-challenge.spec.ts --workers=1
```

## Source of truth

Board vs waiting vs lobby lifecycle should follow `lib/freePlayLobby.ts` (`isBoardReadyGame`, `isWaitingForOpponentSeat`, etc.). Do not reintroduce ad-hoc “ready” flags in pages.
