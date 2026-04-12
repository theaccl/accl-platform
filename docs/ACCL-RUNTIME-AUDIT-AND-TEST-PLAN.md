# ACCL — Runtime flow audit and test plan (code-grounded)

This document reflects the **repository state as inspected** (Next.js app router, Supabase client-side, no separate move API routes found).

**Phase 2 note:** The `/` route table row below corrects an older assumption: `app/page.tsx` exports **`Home`**, not `FreePlayDashboard`. Multiplayer E2E defaults to **`/free`** + **`/requests`** for challenge and queue.

---

## 1. Architecture summary — current app flow

### A. Route structure

| Route | File | Default export | Auth gate | Typical entry |
|-------|------|----------------|-----------|----------------|
| `/login` | `app/login/page.tsx` | `LoginPage` | Reverse gate: logged-in users `replace('/')` | Manual nav, deep link |
| `/` | `app/page.tsx` | `Home` | **No auth redirect** — inline login + profile + `findOrCreateMatch` + manual create | Bookmark, post-`/login`, dev flow |
| `/free` | `app/free/page.tsx` | `FreePage` | `!uid` → `replace('/login')` | User habit, links from home/modes/finished/tournaments |
| `/requests` | `app/requests/page.tsx` | default | `!uid` → `replace('/login')` | Links from lobby, banner, direct challenge copy |
| `/modes` | `app/modes/page.tsx` | default | `!uid` → `replace('/login')` | Link from home nav |
| `/game/[id]` | `app/game/[id]/page.tsx` | default | `!uid` after `getUser` → `replace('/login')` | `router.push` from match/accept/join flows |
| `/finished` | `app/finished/page.tsx` | default | fetches with auth | Lobby links |
| `/tournaments` | `app/tournaments/page.tsx` | placeholder | link back | Modes/home |

**Global shell:** `app/layout.tsx` wraps all routes with `PendingMatchRequestsBanner` (client: pending `match_requests` for current user).

**No middleware.ts** in repo root (auth is per-page client checks).

### B. Flow ownership (components)

| Concern | Owner file(s) |
|---------|----------------|
| Legacy-style home: login fields, profile/username, **`findOrCreateMatch`** (**`openSeatNewGameInsert`**), manual 2p (**`casualTwoPlayerGameInsert`** + share link) | `app/page.tsx` → `Home` |
| Primary **Free Play Lobby**: **`<DirectChallengePanel />`**, **`findOrCreateMatch`** (insert uses `START_FEN`, `status: 'active'`, no `preStartGameTimingFields` on insert), incoming/outgoing request cards, game-ready banner | `app/free/page.tsx` |
| Standalone direct challenge form (shared) | `components/DirectChallengePanel.tsx` |
| Pending incoming count banner → link `/requests` | `components/PendingMatchRequestsBanner.tsx` |
| Inbox: incoming direct **Accept/Decline**, outgoing cancel, open listing **Join** → `createGameFromRequest` | `app/requests/page.tsx` |
| Same accept/decline/joins duplicated for free lobby sections | `app/free/page.tsx` |
| Game board, moves, clocks, draw/resign/rematch UI | `app/game/[id]/page.tsx` |

### C. Game creation points (all `games` inserts / materializing updates)

| Path | File | Function / trigger | Initial row highlights | Both players at creation? | Timing on insert |
|------|------|-------------------|-------------------------|---------------------------|------------------|
| Home **Find Match** create (open seat) | `app/page.tsx` | `findOrCreateMatch` → `insert` | **`openSeatNewGameInsert`** (Phase 4): `START_FEN`, `turn`, **`preStartGameTimingFields()`**, default **live** tempo | No | **null** |
| Home **Find Match** join | `app/page.tsx` | `findOrCreateMatch` → `update` open row | Sets `black_player_id` only (stays `active`) | Yes after update | Same |
| Free **Find Match** create | `app/free/page.tsx` | `findOrCreateMatch` → `insert` | **`openSeatNewGameInsert`** (Phase 4): same contract as home open-seat | No | **null** |
| Free **Find Match** join | `app/free/page.tsx` | `update({ black_player_id })` only | Opener stays `active` | Yes after update | Same |
| Challenge / rematch **accept** (requests page) | `app/requests/page.tsx` | `createGameFromRequest` → `insert` | **`gameInsertFromAcceptedChallenge(r)`** | Yes | Pre-start null |
| Challenge **accept** (free page duplicate) | `app/free/page.tsx` | `acceptRequest` → `insert` | Same helper | Yes | Pre-start null |
| **Home** manual 2p | `app/page.tsx` | `createGameVsOpponent` → `insert` | **`casualTwoPlayerGameInsert`** | Yes | **null** |

**Shared helpers:** `lib/gameStartupInsert.ts` (insert rows); `lib/gameTiming.ts` — `preStartGameTimingFields()` / `afterMoveTimingFields()` on **move persist** in game page.

### D. Timing initialization (actual code)

| Topic | Behavior |
|-------|-----------|
| Pre-start | `preStartGameTimingFields()` on inserts that use it |
| Active clock math (live/daily) | `app/game/[id]/page.tsx`: `liveDailyClockTimeoutState()` requires `status === 'active'` **and** `last_move_at` truthy — so **no timeout / running elapsed clock** until first move writes `last_move_at` |
| UI clocks live/daily | `showLiveClocks` when both players seated and not finished; `elapsedSinceLastMoveMs` uses `last_move_at` — **0** if null (displays full budget, not “ticking down” via elapsed) |
| After move | `persistMove` → `afterMoveTimingFields(tempo, new Date(), live_time_control)` → sets `last_move_at`; correspondence sets `move_deadline_at` via `correspondenceMoveDeadlineMs` |
| Waiting → active | `persistMove` patch: if `statusBefore === 'waiting'` and not game over, `patch.status = 'active'` |

**Risk:** Free-play **create** path does not call `preStartGameTimingFields()` in source; behavior relies on DB null defaults for timing columns.

### E. Move permission / start gating

| Layer | Location | Rule |
|-------|----------|------|
| UI `canPlayMoves` | `app/game/[id]/page.tsx` | `white` and `black` IDs present **and** (`active` \|\| `waiting`) |
| Board input | `boardInputEnabled` | `canPlayMoves`, not spectator, `isMyTurn`, replay off, etc. |
| Turn | `isMyTurn` | Compares `game.turn` to seat; requires both players + active/waiting |
| Persist | `persistMove` | Optimistic chess + Supabase `games` update with FEN concurrency check; then `game_move_logs` insert |

**No dedicated API route** for moves; **no inspected server-side move validator** in this repo — enforcement is **Supabase RLS + client**.

**Solo-start:** With only White seated, `canPlayMoves` is **false** (`!black_player_id`). User sees_waiting message; dragging disabled.

**First move:** Can transition `waiting` → `active` in DB on successful update.

### F. Flows requiring dual-session / dual-context testing

| Flow | Why multi-context |
|------|-------------------|
| Direct challenge | Distinct `from_user_id` / `to_user_id` |
| Request accept | Accepter must see row |
| Random / open match | Two clients converge on same `game.id` |
| First move sync | Realtime/poll correctness |
| Live clock convergence | Both clients read same `games` row after `last_move_at` |
| Draw / resign | Opponent state (partially exercised in single session only with mocks) |

---

## 2. Test matrix — critical scenarios

| ID | Category | Scenario | Notes |
|----|----------|----------|-------|
| S1 | Smoke | `/login` loads | |
| S2 | Smoke | Login + lands on `/` | Needs test credentials |
| S3 | Smoke | Authenticated `/` shows lobby root | `data-testid="home-lobby-root"` |
| S4 | Smoke | `/free` shows free lobby + challenge panel | |
| F1 | Functional | A challenges B; B accepts; same `/game/:id` | Playwright two contexts |
| F2 | Functional | Home random queue two users | Mode + `live_time_control` must match |
| F3 | Functional | First move; both see FEN / turn | Realtime + poll delay |
| R1 | Regression | Solo seat: move UI disabled | One player |
| R2 | Regression | `last_move_at` null: live timeout helper does not apply | Inspect state, not just UI |
| R3 | Regression | Challenge game: clocks don’t “run” before first move | `liveDailyClockTimeoutState` guard |

---

## 3. Proposed test folder skeleton (implemented under `tests/`)

```
tests/
  README.md
  smoke/
    auth-login.spec.ts
    lobby-visible.spec.ts
  functional/
    .gitkeep          # expand: direct-challenge, queue-match, first-move-sync
  regression/
    .gitkeep          # expand: no-solo-start, no-early-clock
  fixtures/
    routes.ts
    env.ts
  helpers/
    auth.ts
    navigation.ts
```

---

## 4. First starter tests (order)

1. **`smoke/auth-login.spec.ts`** — Login page; conditional full login if `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` set.
2. **`smoke/lobby-visible.spec.ts`** — After auth or storageState, assert `home-lobby-root` and/or `free-lobby-root`.

Functional/regression specs intentionally **not** fully implemented until stable users + CI secrets exist.

---

## 5. Reusable helpers / session plan

| Helper | Responsibility |
|--------|----------------|
| `fixtures/env.ts` | Read `PLAYWRIGHT_BASE_URL`, `E2E_*` |
| `helpers/auth.ts` | `loginAs(page, email, password)` |
| `helpers/navigation.ts` | `openHome`, `openFree`, `openGame` (future) |
| Future: `dualSession.ts` | Factory for `browser.newContext()` × 2 |
| Future: `assertions.ts` | Clock / turn / FEN helpers |

---

## 6. Blockers / flaky areas / app changes

| Issue | Severity | Files | Minimum mitigation |
|-------|----------|-------|-------------------|
| No Playwright yet | High (for E2E) | — | Added in this task |
| Next 16 dev: `127.0.0.1` vs `localhost` cross-origin | High (E2E hang on “Loading…”) | `next.config.ts` | `allowedDevOrigins: ['127.0.0.1']` added |
| Login `getUser()` hang | Medium | `app/login/page.tsx` | 12s fallback shows form |
| Supabase auth in E2E | High | — | Env secrets; optional `storageState` |
| Single Next dev per repo dir | Medium | — | Stop existing `next dev` or use `PLAYWRIGHT_SKIP_WEBSERVER` + manual server |
| Realtime latency (2.5s poll on game/home) | Medium | `app/game/[id]/page.tsx`, `app/page.tsx` | `waitFor` with reasonable timeouts; not `networkidle` |
| **Two lobby implementations** (`/` vs `/free`) with **different queue insert semantics** | High | `app/page.tsx`, `app/free/page.tsx` | Tests must target **explicit route**; product may align inserts later |
| Move validation client-only | Medium | `app/game/[id]/page.tsx` | RLS must enforce integrity; document for QA |
| Few stable selectors (before this task) | Medium | Many | Added minimal `data-testid` |
| Challenge UI duplicated (inline home + `DirectChallengePanel` on `/free`) | Low | — | Test one path first; document both |

---

## 7. Free vs Open lane / time-control (product rule)

- **Home (`/`)** `findOrCreateMatch` does **not** set `tempo` / `live_time_control` on insert/join (open seat by `status === 'active'` and `black_player_id` null only). Same lane-purity risk as free for **mixed** open games.
- **Free (`/free`)** “Find Match” uses the same pattern — no time-control on the open-seat `games` row unless DB defaults apply.
- **Direct challenge** (panel + inbox) **does** carry tempo + `live_time_control` on `match_requests` and created `games`.

---

## 8. Tooling

- **Prior:** no `jest`, `vitest`, or `playwright` in `package.json`.
- **Added:** `@playwright/test`, scripts `test:e2e`, `test:e2e:ui`.

---

## 9. File changes in this task

| File | Purpose |
|------|---------|
| `docs/ACCL-RUNTIME-AUDIT-AND-TEST-PLAN.md` | This audit |
| `playwright.config.ts` | Minimal Playwright config (`PLAYWRIGHT_DEV_PORT`, `PLAYWRIGHT_SKIP_WEBSERVER`, `PLAYWRIGHT_REUSE_SERVER`) |
| `tests/**` | Skeleton + smoke specs + helpers |
| `next.config.ts` | `allowedDevOrigins: ['127.0.0.1']` so Playwright using `127.0.0.1` can load Next 16 dev bundles (see blockers) |
| `app/login/page.tsx` | `data-testid` for login controls; **12s fallback** if `getUser()` hangs (misconfigured Supabase) |
| `app/page.tsx` | `data-testid="home-lobby-root"` on dashboard root |
| `app/free/page.tsx` | `data-testid="free-lobby-root"`, `free-find-match`, `game-ready-banner` |
| `components/DirectChallengePanel.tsx` | `data-testid="direct-challenge-panel"`, `challenge-send-submit` |
| `app/game/[id]/page.tsx` | `game-board`, `game-turn-indicator`, `digital-chess-clock`, `clock-white` / `clock-black`, `correspondence-deadline` |
| `package.json` | `@playwright/test` + scripts |
| `.gitignore` | Playwright output dirs |

**No changes to** core matchmaking, queue pairing, or timing math — **test hooks**, **login resilience**, and **dev-origin config** for E2E.

---

## 10. Phase 2 — Updated architecture audit (summary)

- **Routes:** unchanged set; `/` is legacy **`Home`** with client-side login and a separate **`findOrCreateMatch`** from **`/free`**. Auth-gated product paths: `/free`, `/requests`, `/game/[id]`, `/modes`, etc. use `getUser` + `replace('/login')` where implemented.
- **Challenge flow:** `DirectChallengePanel` inserts **`match_requests`**. On accept, **`gameInsertFromAcceptedChallenge`**. **Phase 4:** accepter **`router.push`**; challenger **`router.push`** via **realtime** on `match_requests` UPDATE (see `DirectChallengePanel`).
- **Queue / open seat:** **`/free`** **`findOrCreateMatch`**: join first open **`games`** row (**`black_player_id` null**) or **insert** new. Both users **`router.push`** to **`/game/:id`** when they create or join. **`/`** home variant joins or inserts with **`fen: 'start'`** (normalized in-game to start FEN).
- **Timing:** Challenge-created games get **null** `last_move_at` / `move_deadline_at` from **`preStartGameTimingFields`**. Open-seat creates often **omit** that helper — timing depends on DB. **`liveDailyClockTimeoutState`** does not apply until **`status === 'active'`** **and** **`last_move_at`**.
- **Move gating:** **`canPlayMoves`**: both seat IDs and **`status` in `active` | `waiting`**. Solo open-seat uses **`black_player_id == null`** → **false** (see regression test). **Persistence:** Supabase **`games`** / **`game_move_logs` from client; no move API in repo.

---

## 11. Phase 2 — Multiplayer flow ownership map

| Step | Owner |
|------|--------|
| Render lobby + challenge UI | `app/free/page.tsx`, `components/DirectChallengePanel.tsx` |
| Send challenge | `sendManualChallengeRequest` in `DirectChallengePanel.tsx` |
| Incoming signal | `PendingMatchRequestsBanner.tsx`, `RequestsPage`, free incoming section |
| Accept / decline / join | `acceptRequest`, `declineRequest`, `joinOpenListing`, `createGameFromRequest` in `app/requests/page.tsx`; parallels in `app/free/page.tsx` |
| Redirect to game | Accepter: `router.push` in `acceptRequest` / `joinOpenListing`. Challenger: not auto-routed. |
| Game + moves + clocks | `app/game/[id]/page.tsx` |

---

## 12. Phase 2 — Selector / test-hook additions

| Hook | Location |
|------|-----------|
| `challenge-opponent-lookup`, `challenge-find-opponent` | `DirectChallengePanel.tsx` |
| `pending-match-requests-banner` | `PendingMatchRequestsBanner.tsx` |
| `requests-inbox-root` | `app/requests/page.tsx` |
| `incoming-request-card-{id}`, `challenge-accept-{id}`, `challenge-decline-{id}` | Incoming cards on `requests` page |
| `free-incoming-request-{id}`, `free-challenge-accept-{id}`, `free-challenge-decline-{id}` | `app/free/page.tsx` |
| `Chessboard` `options.id` = `accl-e2e-board` | `app/game/[id]/page.tsx` (squares `#accl-e2e-board-square-e2`, etc.) |

---

## 13. Phase 2 — Dual-session helper plan (implemented subset)

| Helper | File | Role |
|--------|------|------|
| `loginAs` | `helpers/auth.ts` | Single-session login via `/login` |
| `gameIdFromUrl`, `waitForGameUrl` | `helpers/gameUrl.ts` | Parse / wait for `/game/:id` |
| `playOpeningE2E4`, `clickBoardSquare` | `helpers/board.ts` | Click-move e2–e4 on react-chessboard |
| `readLiveClockTexts` | `helpers/clock.ts` | Read `clock-white` / `clock-black` inner text |
| `setupAcceptedLiveChallenge` | `helpers/liveChallengePair.ts` | Two contexts; live 5m white challenge; B accepts on `/requests` |

---

## 14. Phase 2 — Functional tests added

| File | Behavior |
|------|----------|
| `tests/functional/direct-challenge.spec.ts` | Two users; A sends from `/free`; B accepts on `/requests`; same `gameId` when A opens `/game/:id` |
| `tests/functional/queue-match-free.spec.ts` | Two users; sequential `free-find-match`; same game id |
| `tests/functional/first-move-sync.spec.ts` | Shared accepted live game; A plays e2–e4; turn lines converge (White sees opponent turn, Black sees YOUR TURN) |

---

## 15. Phase 2 — Regression tests added

| File | Behavior |
|------|----------|
| `tests/regression/no-solo-start.spec.ts` | One user; `/free` Find Match; **`game-turn-indicator`** contains waiting copy, not `YOUR TURN` |
| `tests/regression/no-early-clock-start.spec.ts` | Two users; accepted live challenge; **live clock** text stable 2.5s on A and B before any move |

---

## 16. Phase 2 — Blockers / flaky areas

| Issue | Severity | Notes |
|-------|----------|-------|
| Requires **two** Supabase users + **`profiles.email`** for B so lookup by email works | **High** | Set `E2E_USER_B_EMAIL` / `_PASSWORD`; ensure profile row email matches auth email |
| **Parallel workers** can collide on shared DB games | **Medium** | Specs use `test.describe.configure({ mode: 'serial' })` per file; CI already `workers: 1` |
| **Realtime / poll** (e.g. requests ~4s poll, banner 2.5s) | **Medium** | Generous `expect` timeouts; inbox accept up to 45s |
| **Chessboard click** sensitivity (overlays, hydration) | **Medium** | Uses stable board id + visible square nodes; may need follow-up if flaky |
| **Correspondence** “no early clock” not auto-tested | **Low** | `showCorrespondenceClocks` gates on `move_deadline_at`; pre-start often hides clock — optional later |
| **`/` vs `/free`** semantic drift | **Low** | E2E targets `/free` for queue/challenge; document for QA |

---

## 17. Phase 2 — Env vars (multiplayer)

- `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` — user A  
- `E2E_USER_B_EMAIL` / `E2E_USER_B_PASSWORD` — user B  

---

## 18. Phase 2 — Files changed with reason

| File | Reason |
|------|--------|
| `components/DirectChallengePanel.tsx` | `challenge-opponent-lookup`, `challenge-find-opponent` testids |
| `components/PendingMatchRequestsBanner.tsx` | `pending-match-requests-banner` |
| `app/requests/page.tsx` | `requests-inbox-root`, per-request `incoming-request-card-*`, `challenge-accept-*`, `challenge-decline-*` |
| `app/free/page.tsx` | `free-incoming-request-*`, `free-challenge-accept-*`, `free-challenge-decline-*` |
| `app/game/[id]/page.tsx` | `options.id: 'accl-e2e-board'` for square locators |
| `tests/fixtures/env.ts` | User B + `hasTwoUserE2ECredentials` |
| `tests/helpers/{gameUrl,board,clock,liveChallengePair}.ts` | Minimal multiplayer helpers |
| `tests/functional/{direct-challenge,queue-match-free,first-move-sync}.spec.ts` | First two-user flows |
| `tests/regression/{no-solo-start,no-early-clock-start}.spec.ts` | Startup safety |
| `docs/ACCL-RUNTIME-AUDIT-AND-TEST-PLAN.md` | Phase 2 audit + tables |
| `tests/README.md` | (updated) two-user env documentation |

**No product logic change** for timing or pairing — **test hooks**, **Chessboard id**, **docs**, and **tests** only.

---

## 19. Phase 3 — A. Game creation paths (comparison)

| Path | File | Trigger | `status` | `fen` (source) | Seats at insert | `preStartGameTimingFields()` | `last_move_at` / `move_deadline_at` in code | Consistent w. no-solo-start* | Consistent w. no-early-clock** |
|------|------|---------|----------|----------------|-----------------|------------------------------|--------------------------------|------------------------------|--------------------------------|
| Direct + rematch **accept** (inbox) | `app/requests/page.tsx` `createGameFromRequest` | Accept / Join open → **insert** | `active` | `START_FEN` | **Both** | **Yes** | Set **null** in patch | Yes (both seated) | Yes (`last_move_at` null until move) |
| Direct **accept** (free duplicate) | `app/free/page.tsx` `acceptRequest` | Accept on free page → **insert** | `active` | `START_FEN` | **Both** | **Yes** | **null** | Yes | Yes |
| **Free** open-seat **create** | `app/free/page.tsx` `findOrCreateMatch` | Find Match → **insert** | `active` | `START_FEN` | White only; black **null** | **Yes** (Phase 4 `openSeatNewGameInsert`) | **null** | **Solo seat** until join | Yes |
| **Free** open-seat **join** | `app/free/page.tsx` | Update `black_player_id` only | (was `active`) | unchanged | Both after update | N/A | N/A | Yes after join | Yes |
| **Home** open-seat **create** | `app/page.tsx` `findOrCreateMatch` | Find Match → **insert** | `active` | `START_FEN` | White only | **Yes** (Phase 4) | **null** | Solo until join | Yes |
| **Home** open-seat **join** | `app/page.tsx` `findOrCreateMatch` | Update black | `active` | … | Both | N/A | N/A | Yes | Yes |
| **Home** manual 2p | `app/page.tsx` `createGameVsOpponent` | Button → **insert** | `active` | `START_FEN` | **Both** | **Yes** (Phase 4 `casualTwoPlayerGameInsert`) | **null** | Yes | Yes |
| **Rematch** (new game) | same as accept | Rematch request **accept** | → `createGameFromRequest` row | | Both | Yes | null | Yes | Yes |

\*No-solo-start: **Open-seat** creates intentionally have one seat empty; UI **blocks** moves until `black_player_id` is set (`canPlayMoves`).

\*\*No-early-clock: **Live timeout math** (`liveDailyClockTimeoutState`) requires `last_move_at`; UI clocks with `last_move_at == null` do not run elapsed countdown the same way as post-move.

**Shared helpers:** `lib/gameStartupInsert.ts` (Phase 4 inserts); `lib/gameTiming.ts` — `afterMoveTimingFields` on move persist in `app/game/[id]/page.tsx`.

**Proof sources:** `lib/gameStartupInsert.ts`; `app/requests/page.tsx`; `app/free/page.tsx`; `app/page.tsx`; `app/game/[id]/page.tsx` `persistMove`, `canPlayMoves`.

---

## 20. Phase 3 — B. Launch / redirect convergence

| Role | Typical `router.push(/game/:id)`? | Relies on manual / banner / inbox? |
|------|-----------------------------------|-------------------------------------|
| **Direct challenge accepter** (`requests` or `free`) | **Yes** — `acceptRequest` / `joinOpenListing` after insert | — |
| **Direct challenge challenger** | **Yes (Phase 4)** — `DirectChallengePanel` subscribes to `match_requests` **UPDATE** for the sent row; on `accepted` + `resolution_game_id`, `router.push(/game/:id)` | Requires **Realtime** on `match_requests` (see `supabase/migrations`). If the subscription fails, user can still use inbox / link. |
| **Free open-seat creator** | **Yes** — `findOrCreateMatch` after insert | — |
| **Free open-seat joiner** | **Yes** — after join update | — |
| **Home open-seat** creator/joiner | **Yes** — same pattern as home `findOrCreateMatch` | — |
| **Home manual 2p creator** | **Yes** | **Opponent** — **`manual-game-share-link`** on `/` surfaces `/game/:id` (Phase 4). No auto-push for opponent session. |

**Shared game id in UI:** `game-row-id` / `game-row-status` on game page; free **Active Games** list; pending banner does **not** expose game id until accept.

**Phase 4:** challenger **realtime push** + home **share link** implemented (small, targeted).

**Tests:** `tests/functional/launch-convergence-challenge.spec.ts` expects **both** players auto-reach `/game/:id`; `queue-match-free.spec.ts` covers symmetric open-seat.

---

## 21. Phase 3 — C. End-state / result support (runtime map)

| Outcome | Where triggered | UI | DB / RPC | Board after | Clocks |
|---------|-----------------|-----|----------|-------------|--------|
| **Resign** | `handleResign` | `resign-button` | `finish_game` RPC | `canPlayMoves` false; `boardInputEnabled` false | `showLiveClocks` false when `finished` |
| **Live/daily timeout** | `scheduleLiveTimeoutFinish` / interval + `liveDailyClockTimeoutState` | (automatic when flag fires) | `finish_game` `timeout` | Finished | Stopped (finished) |
| **Checkmate / stalemate / 50-move / insufficient / repetition** | `gameOverFieldsAfterMove` inside `persistMove` after legal move | (no extra button) | Patch on `games` row with `status: 'finished'`, `result`, `end_reason` | Finished | Stopped |
| **Draw by agreement** | `handleAcceptDraw` | Accept Draw | **`finish_game` RPC** (`p_result: draw`, `p_end_reason: draw_agreement`) — aligned with `app/page.tsx`; see §44 | Finished | Stopped |
| **Draw offer pending** | `handleOfferDraw` | `offer-draw-button` | `draw_offered_*` columns | Play continues | Unchanged |
| **Rematch request** | `handleSendRematchRequest` | Finished-only **Send Rematch Request** | Inserts `match_requests` (not a new `games` row until accept) | N/A | N/A |
| **Abort before “real start”** | Decline/cancel **request** only | Requests/free lists | Updates `match_requests`, not `games` | N/A | N/A |

**Finished-state move lock:** `onPieceDrop` returns false if `game.status === 'finished'`; `showPlayerActions` false; `boardInputEnabled` false.

---

## 22. Phase 3 — D. Data-layer safety review

| Layer | What exists in repo |
|------|----------------------|
| **Move `games` update** | Client `persistMove`: optimistic **FEN equality** `.eq('fen', fenBefore)` (or `fen` null); no explicit “must be your turn” in the Supabase query string. |
| **`game_move_logs` insert** | Migration `game_move_logs_insert_self`: requires `player_id = auth.uid()` and user is **white or black** on that game. → **Persistence partially constrains** log writes to participants. |
| **`games` table RLS** | **No `games` RLS migration** in this repo — **ambiguous** whether production DB restricts updates; **do not assume** server rejects illegal FEN/turn without checking Supabase dashboard. |
| **Resign / timeout finish** | `finish_game` **RPC** (behavior not defined in repo migrations here) — treat as **server-side** for those end states if RPC is secured in DB. |

**Verdict:** Move **integrity beyond “participant”** (legal turn, finished guard) is primarily **client** (`canPlayMoves`, `isMyTurn`, `onPieceDrop`). **Logs** add participant binding. **`games` row updates** may still be **UI-trusted** unless RLS/policies exist outside repo.

---

## 23. Phase 3 — E. Tests added

| File | Purpose |
|------|---------|
| `tests/functional/launch-convergence-challenge.spec.ts` | Both reach `/game/:id` (Phase 4: challenger realtime); see §33 |
| `tests/functional/end-state-resign.spec.ts` | Black resigns; both `game-over-banner` + `finished`; resign buttons gone; post-finish clicks do not restore `active` |

**Deferred (documented):** **Timeout** E2E — requires live clock burn or clock manipulation; **checkmate** — long sequence. **Draw offer/accept/decline** added in Phase 5 (`draw-agreement`, `draw-decline` specs).

---

## 24. Phase 3 — F. Selectors added

| `data-testid` | Location |
|---------------|----------|
| `game-row-id` | `app/game/[id]/page.tsx` — Game ID line |
| `game-row-status` | Status line |
| `game-over-banner` | Finished “Game over” banner |
| `resign-button` | Resign control |
| `offer-draw-button` | Offer Draw |
| `draw-accept-button`, `draw-decline-button`, `draw-offer-banner` | Phase 5 — accept/decline draw + offer status |

---

## 25. Phase 3 — G. Blockers / inconsistencies

| Issue | Severity | Note |
|-------|----------|------|
| **Startup timing on open-seat / manual 2p** | **Resolved (Phase 4)** | All paths use `preStartGameTimingFields()` via `lib/gameStartupInsert.ts` |
| **Challenger stranding** | **Mitigated (Phase 4)** | `DirectChallengePanel` → realtime `match_requests` UPDATE → `router.push` |
| **Home manual 2p opponent** | **Low** | `manual-game-share-link` only; no push to opponent browser |
| **`games` update policies** not in repo | **High** for security audit | Move spam/theory unclear without DB policies |
| **Timeout E2E** | **Low** (test) | Runtime too long for thin CI |

---

## 26. Phase 3 — H. Files changed (reason)

| File | Reason |
|------|--------|
| `app/game/[id]/page.tsx` | Testids: `game-row-id`, `game-row-status`, `game-over-banner`, `resign-button`, `offer-draw-button` |
| `tests/functional/launch-convergence-challenge.spec.ts` | Challenge launch asymmetry coverage |
| `tests/functional/end-state-resign.spec.ts` | Resign + finished move lock |
| `docs/ACCL-RUNTIME-AUDIT-AND-TEST-PLAN.md` | Phase 3 audit §19–26 |

---

## 27. Phase 4 — A. Shared startup contract (code reference)

| Field | Contract |
|-------|-----------|
| **`fen`** | Always canonical `START_FEN` from `lib/startFen.ts` (never literal `'start'` in inserts). |
| **`turn`** | `'white'`. |
| **`status`** | `'active'` for all paths here (open-seat rows keep `black_player_id` null until join). |
| **`last_move_at` / `move_deadline_at`** | `null` at insert via `preStartGameTimingFields()` for **every** path in Phase 4. |
| **`tempo` / `live_time_control`** | Challenge/rematch: from request. Open-seat & casual 2p on `/`: **`tempo`** default **`live`** (`normalizeGameTempo(DEFAULT_GAME_TEMPO)`), **`live_time_control`** **`null`** (client normalizes further). |
| **Both seats** | Challenge/rematch/casual 2p: both IDs at insert. Open-seat: white only; **no solo moves** until black joins (`canPlayMoves`). |
| **Pre-start vs active-ready** | DB row is **`active`**; **clocks / timeout math** treat “no moves yet” as **`last_move_at` null** (see `liveDailyClockTimeoutState`). |

**Live / daily / correspondence at insert:** Challenge rows carry request tempo; open-seat/casual default to **live** in DB for consistent clock UI defaults.

---

## 28. Phase 4 — B. Creation-path normalization (implementation)

| Path | Change |
|------|--------|
| Challenge / rematch accept | `gameInsertFromAcceptedChallenge()` in `lib/gameStartupInsert.ts`; used by `app/requests/page.tsx` and `app/free/page.tsx` |
| Free open-seat create | `openSeatNewGameInsert(userId)` |
| Home open-seat create | Same helper |
| Home manual 2p | `casualTwoPlayerGameInsert(white, black)` |

---

## 29. Phase 4 — C. Launch convergence hardening

1. **`DirectChallengePanel`**: after a successful challenge send, sets `pendingChallengeRequestId` and subscribes to **`match_requests` UPDATE** (`id=eq.<request>`). On **`accepted`** + **`resolution_game_id`**, **`router.push`** and clear subscription.
2. **`app/page.tsx`**: when **`latestGame.black_player_id`** is set (manual 2p), renders **`manual-game-share-link`** (`Link` to `/game/:id`) for the opponent’s session.

**Remaining asymmetry:** manual 2p **opponent** still must open the link (no server push to their browser).

---

## 30. Phase 4 — D. Tests added/updated

| File | Notes |
|------|-------|
| `tests/regression/startup-normalization.spec.ts` | Open-seat: `data-fen` === `START_FEN`, empty timing attrs; challenge: both players same snapshot |
| `tests/functional/launch-convergence-challenge.spec.ts` | Both auto-`nav` to `/game/:id` |
| `direct-challenge`, `first-move-sync`, `end-state-resign`, `no-early-clock-start` | Rely on challenger auto-nav (removed redundant `pageA.goto` where applicable) |

---

## 31. Phase 4 — E. Selectors / helpers

| Item | Location |
|------|----------|
| `game-startup-snapshot` | `data-fen`, `data-last-move-at`, `data-move-deadline-at` on `app/game/[id]/page.tsx` |
| `manual-game-share-link` | `app/page.tsx` after manual 2p create |
| `lib/gameStartupInsert.ts` | Shared insert builders (helper, not a selector) |

---

## 32. Phase 4 — F. DB policy / unresolved checklist

- **`games` RLS/policies** are still **not defined in this repo**. For persistence-layer confidence, manually verify in Supabase: **`games`** `UPDATE`/`INSERT` policies for `authenticated`, column-level checks (if any), and that **`finish_game`** is `SECURITY DEFINER` with internal checks as intended.
- **Realtime:** challenger navigation depends on **`match_requests`** being in the realtime publication (see `20260403120000_realtime_match_requests.sql`).

---

## 33. Phase 4 — G. Residual risks

| Risk | Note |
|------|------|
| Open-seat rows now set **`tempo: live`** explicitly | Slightly stricter than “fully untyped” open games; aligns with client `normalizeGameTempo(null) === 'live'`. |
| Multiple concurrent outgoing challenges | Last sent request id wins subscription; edge cases if two accepts race simultaneously. |
| Realtime delivery delay | Challenger `router.push` may lag accepter by network; tests use **45s** timeouts. |

---

## 34. Phase 4 — H. Files changed (reason)

| File | Reason |
|------|--------|
| `lib/gameStartupInsert.ts` | **New** — shared `START_FEN` + `preStartGameTimingFields` + challenge builder |
| `app/free/page.tsx` | Use helpers for open-seat + accepted challenge inserts |
| `app/requests/page.tsx` | Use `gameInsertFromAcceptedChallenge` |
| `app/page.tsx` | Helpers for open-seat + manual 2p; **share link**; `Link` import |
| `components/DirectChallengePanel.tsx` | Realtime **accepted** → `router.push` |
| `app/game/[id]/page.tsx` | **`game-startup-snapshot`** test hook |
| `tests/regression/startup-normalization.spec.ts` | Contract regression |
| `tests/functional/launch-convergence-challenge.spec.ts` | Both-side auto launch |
| `tests/functional/direct-challenge.spec.ts` & allies | Drop manual challenger `goto` |
| `docs/ACCL-RUNTIME-AUDIT-AND-TEST-PLAN.md` | Phase 4 §27–34; Phase 3 launch table corrections |

---

## 35. Phase 5 — A. DB policy verification table (repo evidence only)

| Object | Source / evidence in repo | What is enforced (if stated) | Confidence | Open risk |
|--------|---------------------------|------------------------------|------------|-----------|
| **`public.game_move_logs`** | `supabase/migrations/20260401120000_game_move_logs.sql` | RLS enabled; **SELECT** allowed to `authenticated` if `auth.uid()` is `games.white_player_id` or `games.black_player_id` for that `game_id`; **INSERT** allowed if `player_id = auth.uid()` and same participant check | **High** *for this migration file* | If migration never applied in a project, behavior differs. No **UPDATE/DELETE** policies → those operations are denied by default under RLS (typical Postgres). |
| **`public.games`** | **No `CREATE POLICY` / RLS SQL in repo** | *Not defined here* | **Unverifiable from repo** | **High** for security posture: client uses broad `.from('games').update`/`insert` patterns; real enforcement depends on Supabase dashboard / migrations not checked into this repo. |
| **`public.match_requests`** | **No RLS SQL in repo** | *Not defined here* | **Unverifiable from repo** | Requests visibility and tampering depend on console state. |
| **`public.profiles`** (and other app tables) | **No RLS SQL in repo** | *Not defined here* | **Unverifiable** | — |
| **`finish_game`** RPC | Called from `app/game/[id]/page.tsx` (**`resign`**, **`timeout`**, **`handleAcceptDraw`** Phase 6) and `app/page.tsx` (**`finishAsDraw`**, resign); **no function definition in repo** | *Unknown* | **Insufficient evidence** | Must inspect Supabase (function body, `SECURITY DEFINER`, role grants, checks on `p_game_id` / seat / status). |
| **Realtime publication `supabase_realtime`** | `20260401120000_game_move_logs.sql` (tail), `20260402120000_realtime_games.sql`, `20260403120000_realtime_match_requests.sql` | Best-effort `ALTER PUBLICATION ... ADD TABLE` | **High** *if applied* | This affects **event delivery**, not row authorization. |
| **`supabase/verify_realtime_setup.sql`** | helper script | Lists table existence + `pg_publication_tables` | N/A | Manual verification aid only. |

**Verdict:** Only **`game_move_logs`** RLS is **fully described in-repo**. Everything else requires **Supabase console / live catalog** inspection. Do **not** infer **`games`** immutability, turn checks, or “finished game” write blocks from this repository alone.

### Phase 5 — Supabase console checklist (persistence confidence)

1. **RLS** on `games`, `match_requests`, `profiles`: enabled or not; list **all** policies (SELECT/INSERT/UPDATE/DELETE).  
2. **`finish_game`**: full SQL; confirm it validates caller, game status, and intended side effects (ratings, etc.).  
3. **`game_move_logs`**: confirm migration applied; optional smoke: non-participant session cannot INSERT.  
4. **Column types**: whether `games.source_type` is `text` vs enum — needed if new values (e.g. `open_listing`) are used.

---

## 36. Phase 5 — B. Move-write path safety review

| Boundary | Present? | Where |
|----------|----------|--------|
| **Illegal move (rules)** | UI / `chess.js` only before `persistMove` | `applyPlayerMove` |
| **Your turn / finished** | Client guards | `boardInputEnabled`, `canPlayMoves`, `game.status` |
| **FEN race** | Client optimistic lock | `persistMove` → `update` … `.eq('fen', fenBefore)` (or null-fen branch) |
| **Participant-only move log** | **DB (if migration applied)** | `game_move_logs_insert_self` policy |
| **Participant-only / turn-valid `games` update** | **Not evidenced in repo** | — |

**Answer to “invalid move blocked only in UI?”** — **Rule validity** is enforced **before** the network by **client + chess.js**. **Persistence** relies on **FEN equality** for concurrency; there is **no** in-repo server move validator. **`games`** **RLS** is **unknown**.

---

## 37. Phase 5 — C. Result / end-state support map (refined)

| Result | Trigger location | UI control | Write path | Fields / notes | Stable E2E? |
|--------|------------------|------------|------------|----------------|-------------|
| **Resign** | `handleResign` | `resign-button` | **`finish_game` RPC** | Server returns row | Yes — existing |
| **Live/daily timeout** | `scheduleLiveTimeoutFinish` | (none) | **`finish_game` RPC** | | No — slow/flaky |
| **Draw offer** | `handleOfferDraw` | `offer-draw-button` | `games.update` | `draw_offered_by`, `draw_offered_at` | Yes |
| **Draw accept** | `handleAcceptDraw` | `draw-accept-button` | **`finish_game` RPC** (Phase 6 — same signature as `app/page.tsx` `finishAsDraw`) | Returned row from RPC | Yes |
| **Draw decline** | `handleDeclineDraw` | `draw-decline-button` | `games.update` | Clears draw fields | Yes — Phase 5 |
| **Mate / stalemate / … after move** | `gameOverFieldsAfterMove` | — | `persistMove` **direct `games.update` patch** | Finished + `result` / `end_reason` | **Deferred** — multi-move |
| **Finished immutability** | Client gates | No resign/draw when `finished` | Depends on **`games`** policies + RPC behavior | | Exercised after resign + after draw |

**Trust gap (Phase 6 update):** **Draw accept** on `/game/[id]` now uses **`finish_game`**, same as **resign/timeout/home draw**. **Terminal board completion** still ends via **`persistMove`** direct patch — **not** the RPC — unless a future backend unifies it.

---

## 38. Phase 5 — D. Tests added

| File | Purpose |
|------|---------|
| `tests/functional/draw-agreement.spec.ts` | White offers, black accepts; both see finished + draw banner; `playOpeningE2E4` does not revert `status` |
| `tests/functional/draw-decline.spec.ts` | Decline → stays `active`; offer UI available again |

**Not added (documented):** clock **timeout** E2E; **short forced mate** — would add flakiness or many plies.

---

## 39. Phase 5 — E. Selectors / hooks

| `data-testid` | Location |
|---------------|----------|
| `draw-accept-button` | `app/game/[id]/page.tsx` |
| `draw-decline-button` | same |
| `draw-offer-banner` | same (draw offer status region) |
| `finished-result-summary` | Phase 6 — `data-end-reason`; Phase 7 — **`data-result`** |

Reused: `game-over-banner`, `game-row-status`, `offer-draw-button`, board helpers.

---

## 40. Phase 5 — F. `source_type` / request classification

| Change | Detail |
|--------|--------|
| **Implemented** | `visibility === 'open'` on accepted request → `games.source_type = 'open_listing'` (via `gameInsertFromAcceptedChallenge`). |
| **Unchanged** | `challenge` → `challenge`; `rematch` → `rematch_request`. |
| **Deferred** | Other `request_type` values still map to **`rematch_request`** by fallback — may be wrong for future types. |
| **Risk** | If production uses an **ENUM** for `source_type`, adding `open_listing` may require a DB migration — **not visible in repo**. |

**Display:** `lib/gameDisplayLabel.ts` labels `open_listing` in banner + subtitle helpers.

---

## 41. Phase 5 — G. Blockers / trust gaps

| Blocker | Impacted areas | Severity | Minimum next step |
|---------|----------------|----------|-------------------|
| **`games` / `match_requests` RLS not in repo** | All move + request writes | **High** for audit | Export policies from Supabase or add migrations to repo |
| **`finish_game` body unknown** | Resign, timeout, home `finish_game` | **Medium** | Read SQL in dashboard; document guarantees |
| **Draw accept vs RPC split** | Ratings / integrity | **Mitigated on game page (Phase 6)** | `handleAcceptDraw` → `finish_game`; **terminal outcomes** still bypass RPC — see §44–§45 |
| **Timeout / mate E2E** | Tests | **Low** | Keep manual / unit tests; avoid multi-minute E2E |
| **Realtime** | Finished state visibility | **Low** | Already mitigated by polling on game page |
| **`source_type` ENUM** | `open_listing` insert | **Low** | Confirm column type in DB |

---

## 42. Phase 5 — H. Files changed (reason)

| File | Reason |
|------|--------|
| `lib/gameStartupInsert.ts` | `open_listing` `source_type` when `visibility === 'open'` |
| `lib/gameDisplayLabel.ts` | Display labels for `open_listing` |
| `app/game/[id]/page.tsx` | Draw flow testids; Phase 6: `finished-result-summary` |
| `tests/functional/draw-agreement.spec.ts` | Draw accept + finished immutability |
| `tests/functional/draw-decline.spec.ts` | Decline leaves active |
| `docs/ACCL-RUNTIME-AUDIT-AND-TEST-PLAN.md` | Phase 5 §35–42; §21 draw row note |
| `tests/README.md` | Phase 5 draw specs note |

---

## 43. Phase 6 — A. Real / deployed verification table

**Important:** Rows below reflect **workspace limits**: the Cursor environment **does not** connect to your Supabase project. **“Deployed DB confirmed”** is **no** unless a human ran the SQL pack against production/staging and recorded results.

| Object | Confirmed from repo? | Confirmed from deployed DB (this run)? | Evidence | Current confidence | Open risk |
|--------|----------------------|----------------------------------------|----------|-------------------|-----------|
| `game_move_logs` RLS policies | **Yes** — `supabase/migrations/20260401120000_game_move_logs.sql` | **Not verified here** | Migration file vs live `pg_policies` | **High** for file contents; **medium** for deployment | Drift if migration never applied |
| `games` RLS / policies | **No** — not in repo | **Not verified here** | — | **Low** (repo); **unknown** (prod) | Broad client `UPDATE` if policies absent |
| `match_requests` RLS | **No** | **Not verified here** | — | **Low** | Tampering / visibility |
| `finish_game` definition | **No** — only TS `rpc()` call sites | **Not verified here** | `app/game/[id]/page.tsx`, `app/page.tsx` | **Low** | Security + side effects opaque until SQL inspected |
| Realtime publication | **Partial** — migrations add tables to publication | **Not verified here** | `20260402120000_*`, `20260403120000_*`, `game_move_logs` tail | **Medium** (if migrations applied) | Wrong publication membership → missed events |

**Copy/paste SQL pack:** `supabase/MANUAL_VERIFICATION_PACK.sql` (Phase 6). Run in Supabase SQL Editor; fill in a local runbook with actual query outputs if you need “deployed = yes”.

---

## 44. Phase 6 — B. Result-path comparison table (code-grounded)

| Path | Trigger / UI | File / handler | DB / RPC | Status / result fields | Clock / timing | Rating / audit in code | Shared vs bespoke |
|------|--------------|----------------|----------|------------------------|----------------|------------------------|-------------------|
| **Resign** | `resign-button` | `handleResign` | **`finish_game`** `black_win`/`white_win`, `resign` | From RPC return | Per RPC / returned row | **`app/page.tsx`** reloads profile after resign/draw (home only); **game page** does not call `loadProfile` — side effects only if RPC does | **RPC** |
| **Timeout** | Automatic | `scheduleLiveTimeoutFinish` | **`finish_game`** `timeout` | From RPC | — | Same as resign | **RPC** |
| **Draw accept** | `draw-accept-button` | `handleAcceptDraw` | **`finish_game`** `draw`, `draw_agreement` | From RPC | — | Same as resign (RPC-dependent) | **RPC** (Phase 6) |
| **Draw offer** | `offer-draw-button` | `handleOfferDraw` | **`games.update`** | `draw_offered_*` | — | None visible | **Direct row** |
| **Draw decline** | `draw-decline-button` | `handleDeclineDraw` | **`games.update`** | Clears `draw_offered_*` | — | None visible | **Direct row** |
| **Terminal board** (mate/stalemate/insuff/repetition) | (no button) | `persistMove` + `gameOverFieldsAfterMove` | **`games.update`** patch | `finished`, `result`, `end_reason`, etc. | Clears deadline; clock patch on last move | None visible in client | **Direct row** — **divergent** from `finish_game` |
| **Rematch** | Finished-only button | `handleSendRematchRequest` | **`match_requests` insert** | N/A | N/A | N/A | Separate flow |

**Conclusion:** **Resign**, **timeout**, and **draw accept** now share **`finish_game`**. **Draw offer/decline** and **terminal completion** still use **direct `games.update`**. Any **Elo / audit** logic tied **only** to `finish_game` **does not** apply to **terminal-on-move** finishes until backend unifies them.

---

## 45. Phase 6 — C. Move / finish trust-boundary review

| Mechanism | Depends on client correctness? | Server function? | Side-effect skew risk |
|-----------|----------------------------------|------------------|------------------------|
| `persistMove` | **Yes** (turn, finished, legality) | **No** in-repo validator; **`games`** policies unknown | **High** if RLS weak; terminal finish **bypasses** `finish_game` |
| `finish_game` | **Partially** (caller supplies `p_result` / reason) | **Yes** (definition not in repo) | **Lower** for paths using RPC **if** function enforces invariants |
| Direct `games.update` (draw offer/decline) | **Yes** | Policies unknown | **Medium** — narrow column set |
| **Shared “safe” path** | — | **`finish_game`** for **resign / timeout / draw agreement** | Prefer RPC for anything that mutates **final result** + ratings |
| **Divergent path** | — | **`persistMove`** terminal patch | **Likely skew** if ratings only updated in `finish_game` |
| **Unresolved** | — | **`finish_game` body** | Must read DDL in Supabase |

---

## 46. Phase 6 — D. Normalization performed

| Change | Rationale |
|--------|-----------|
| **`handleAcceptDraw` → `finish_game` (`draw` / `draw_agreement`)** | Same arguments already used in **`app/page.tsx`** `finishAsDraw`; small, explicit alignment; avoids client-only draw finish vs resign. |
| **Deferred** | Moving **terminal board completion** into `finish_game` requires **new or extended RPC** + server validation — **not** done (no SQL in repo). |

If **`finish_game`** in production rejects draw agreement without other checks (e.g. requires pending draw offer), **E2E** or manual QA will surface it; document the required RPC contract when DDL is available.

---

## 47. Phase 6 — E. Tests added or updated

| Item | Change |
|------|--------|
| `tests/helpers/finishedGameUi.ts` | **`expectSharedFinishedGameUi`**, **`expectFinishedEndReason`** — shared finished UI + `data-end-reason` |
| `tests/functional/draw-agreement.spec.ts` | Uses helper; asserts **`draw_agreement`** |
| `tests/functional/end-state-resign.spec.ts` | Uses helper; asserts **`resign`** |

**Not added (Phase 6):** timeout E2E. **Phase 7** adds a short **checkmate** E2E (`terminal-finish-checkmate.spec.ts`) for **`persistMove`** parity — see §55.

---

## 48. Phase 6 — F. Selectors / hooks

| `data-testid` | Location |
|---------------|----------|
| `finished-result-summary` | `app/game/[id]/page.tsx` — finished banner line; **`data-end-reason`** mirrors `games.end_reason` |

---

## 49. Phase 6 — G. Manual Supabase verification pack

- **File:** `supabase/MANUAL_VERIFICATION_PACK.sql`  
- **Contents:** RLS flags, `pg_policies`, `finish_game` metadata + `pg_get_functiondef`, table grants, `pg_publication_tables`, human checklist (green / red flags).

---

## 50. Phase 6 — H. Blockers / trust gaps (remaining)

| Blocker | Severity | Next step |
|---------|----------|-----------|
| **No live DB verification in this workspace** | — | Run **§49** pack; record outputs |
| **`finish_game` DDL still not in repo** | **Medium** | Export function to `supabase/migrations` or internal docs |
| **Terminal completion vs `finish_game` split** | **Medium** (if ratings matter) | Add RPC path or trigger for “finish from move” or document intentional split |
| **`games` / `match_requests` policies** | **High** for security | Dashboard review + optional migrations in repo |
| **Timeout / mate E2E** | **Low** | Keep deferred |

---

## 51. Phase 6 — I. Files changed (reason)

| File | Reason |
|------|--------|
| `app/game/[id]/page.tsx` | Draw accept → `finish_game`; `finished-result-summary` + `data-end-reason` |
| `supabase/MANUAL_VERIFICATION_PACK.sql` | **New** — deployable policy/function/publication SQL |
| `tests/helpers/finishedGameUi.ts` | **New** — shared finished assertions |
| `tests/functional/draw-agreement.spec.ts` | Helper + end_reason |
| `tests/functional/end-state-resign.spec.ts` | Helper + end_reason |
| `docs/ACCL-RUNTIME-AUDIT-AND-TEST-PLAN.md` | Phase 6 §43–§51; Phase 5 cross-refs corrected |

---

## 52. Phase 7 — A. Live verification table

**Live DB queried from the ACCL Cursor workspace (automated):** **No** — no project DB URL/credentials are used in-repo for agent runs. Treat all **live** columns below as **blocked until an operator runs the pack**, unless you paste results into this doc.

| Object | Repo evidence | Live DB evidence (this phase) | Status | Confidence | Immediate risk |
|--------|---------------|---------------------------------|--------|------------|----------------|
| `public.game_move_logs` policies | `20260401120000_game_move_logs.sql` | **Not captured here** | **blocked** | Repo: high; live: unknown | Drift / missing migration |
| `public.games` policies | None in repo | **Not captured here** | **blocked** | Low | Overbroad UPDATE |
| `public.match_requests` policies | None in repo | **Not captured here** | **blocked** | Low | Request leaks / tampering |
| `finish_game` | TS `rpc()` only | **Not captured here** | **blocked** | Low | Opaque security + side effects |
| Realtime publication | Partial SQL in repo | **Not captured here** | **blocked** | Medium | Missing `games` row events |
| `finish_game` EXECUTE grants | Not in repo | **Not captured here** | **blocked** | — | Overexposed RPC |

**Operator procedure:** `supabase/OPERATOR_RUNBOOK.md` + `supabase/MANUAL_VERIFICATION_PACK.sql`.

---

## 53. Phase 7 — B. Terminal-finish parity table (evidence from code)

Comparison: **equivalent** (same UX contract), **likely equivalent** (assumes RPC sets same columns), **divergent** (different code path), **unknown** (needs DDL).

| Concern | Resign | Timeout | Draw accept | Terminal board (`persistMove`) |
|---------|--------|---------|-------------|----------------------------------|
| **Trigger** | `resign-button` | clock hook | `draw-accept-button` | legal move → mate/stalemate/… |
| **Write path** | `finish_game` RPC | `finish_game` RPC | `finish_game` RPC | **`games.update` in `persistMove`** |
| **`status`** | **likely** `finished` | **likely** | **likely** | `finished` (patch) |
| **`end_reason`** | `resign` | `timeout` | `draw_agreement` | `checkmate`, `stalemate`, etc. |
| **`result`** | `white_win` / `black_win` | same pattern | `draw` | `black_win` / `white_win` / `draw` |
| **Clock fields on finish** | RPC / return row | RPC | RPC | **`persistMove` patch** (last move timing + game over fields) |
| **Move log row** | N/A | N/A | N/A | **Yes** — insert **after** terminal `games.update` |
| **Rating / audit in client** | None on `/game/[id]` | None | None | None — **all depend on RPC/triggers** |
| **vs `finish_game` invariants** | Server | Server | Server | **None in-repo** — **divergent** |

**UI parity (Phase 7):** **`finished-result-summary`** exposes `data-result` + `data-end-reason` for **all** finished games regardless of path → **equivalent** observability for E2E.

---

## 54. Phase 7 — C. `persistMove` terminal-completion review

| Question | Answer (repo) |
|----------|----------------|
| **When is terminal state applied?** | After `board.move` succeeds, `gameOverFieldsAfterMove(nextFen, game)` returns non-null. |
| **Fields written** | Same patch as ongoing moves **plus** `gameOver` spread: `status`, `result`, `winner_id` (mate), `end_reason`, `finished_at`, `move_deadline_at: null`, `draw_offered_by/at: null`. |
| **`end_reason` set?** | **Yes** — `checkmate`, `stalemate`, `insufficient_material`, `threefold_repetition`. |
| **Same `result` strings as RPC paths?** | Overlaps (`draw`, `white_win`, `black_win`) for comparable outcomes; RPC may normalize variants (e.g. `1/2-1/2`) — **unknown** without DDL. |
| **Audit / rating skipped?** | **Client shows nothing.** If **`finish_game`** is the **only** place Elo updates, **terminal completion bypasses that** → **likely skew** until backend aligns. |
| **Bypass server invariants?** | **Yes w.r.t. `finish_game`** — update goes **straight** to `games` with FEN guard only. **DB RLS** could still block; **not in repo**. |

**Harm vs danger:** **Harmless** for casual UX if ratings unused; **dangerous** for competitive integrity if ratings/audit are RPC-only.

---

## 55. Phase 7 — D. Tests added or updated

| Item | Notes |
|------|------|
| `tests/helpers/board.ts` | `playFoolsMateCooperative` (short deterministic mate line) |
| `tests/helpers/finishedGameUi.ts` | `expectFinishedParitySummary` (`data-result` + `data-end-reason` + shared banner) |
| `tests/functional/terminal-finish-checkmate.spec.ts` | Fool’s mate → **`black_win` / `checkmate`** on both clients |
| `draw-agreement.spec.ts`, `end-state-resign.spec.ts` | Use **`expectFinishedParitySummary`** |

**Still not added:** live DB integration tests; long timeout E2E.

---

## 56. Phase 7 — E. Selectors / helpers

| Item | Detail |
|------|--------|
| `finished-result-summary` | **`data-result`** added (Phase 7); **`data-end-reason`** (Phase 6) |
| `expectFinishedParitySummary` | Single helper for RPC vs terminal finished assertions |

---

## 57. Phase 7 — F. Normalization fix made or deferred

| Decision | Detail |
|----------|--------|
| **Made (UI / tests)** | Expose **`data-result`** next to **`data-end-reason`**; **shared parity helper** across resign, draw, and terminal mate. |
| **Deferred (backend)** | Route **terminal completion** through **`finish_game`** or a new RPC — **requires** DDL + agreed `p_end_reason` / `p_result` matrix **not in repo**. |

---

## 58. Phase 7 — G. Operator runbook

**File:** `supabase/OPERATOR_RUNBOOK.md` — run order, paste-back artifacts, safe vs dangerous signals, how to update §52.

---

## 59. Phase 7 — H. Blockers / trust gaps

| Blocker | Impacted | Severity | Minimum next step |
|---------|----------|----------|-------------------|
| **No live DB read in workspace** | §52 | **High** for “proof” | Operator runs pack; paste evidence |
| **`finish_game` still opaque** | Rating parity | **Medium** | Export DDL into repo or internal wiki |
| **`persistMove` terminal ≠ RPC** | Elo / audit | **Medium** if ratings matter | Server-side finish on terminal moves or trigger |
| **Fool’s mate E2E** | Test | **Low** | If flaky, mark skip + link §55 |
| **50-move / repetition depth** | Terminal | **Low** | Not separately E2E’d |

---

## 60. Phase 7 — I. Files changed (reason)

| File | Reason |
|------|--------|
| `app/game/[id]/page.tsx` | `data-result` on `finished-result-summary` |
| `tests/helpers/finishedGameUi.ts` | `expectFinishedParitySummary` |
| `tests/helpers/board.ts` | `playFoolsMateCooperative` |
| `tests/functional/terminal-finish-checkmate.spec.ts` | Terminal finish parity E2E |
| `tests/functional/draw-agreement.spec.ts` | Parity helper |
| `tests/functional/end-state-resign.spec.ts` | Parity helper |
| `supabase/OPERATOR_RUNBOOK.md` | **New** — manual live verification steps |
| `supabase/MANUAL_VERIFICATION_PACK.sql` | Pointer to runbook |
| `docs/ACCL-RUNTIME-AUDIT-AND-TEST-PLAN.md` | Phase 7 §52–§60 |
| `tests/README.md` | Phase 7 note |

---

## 61. Phase 8 — A. Updated verification table (repo vs live)

**Live ingest for Phase 8:** No outputs from `MANUAL_VERIFICATION_PACK.sql` were pasted into this repository or supplied to the implementation agent. The table below is **unchanged operationally** from Phase 7: **live** columns remain **blocked / empty** until an operator fills them.

| Object | Repo evidence | Live DB evidence (Phase 8 ingest) | Status | Confidence | Immediate risk |
|--------|---------------|-----------------------------------|--------|------------|----------------|
| `public.game_move_logs` | `20260401120000_game_move_logs.sql` | **None ingested** | **blocked** | Repo: high; live: unknown | Same as §52 |
| `public.games` policies | Not in repo | **None ingested** | **blocked** | Low | Same as §52 |
| `public.match_requests` policies | Not in repo | **None ingested** | **blocked** | Low | Same as §52 |
| `finish_game` | TS `rpc()` only | **None ingested** (no `pg_get_functiondef` text) | **blocked** / **opaque** | Low | Side effects unknown |
| Realtime publication | Partial migrations | **None ingested** | **blocked** | Medium | Same as §52 |

**Next step:** Run `supabase/MANUAL_VERIFICATION_PACK.sql`, paste outputs into a ticket or appendix, then **replace** the “Live DB evidence” column above with dated notes.

---

## 62. Phase 8 — B. `finish_game` behavior summary

| Topic | Finding |
|-------|---------|
| **Definition in repo** | **None** — no SQL migration or function body checked in. |
| **Guarantees** | **Unknown** — cannot assert participant checks, status gates, or column normalization. |
| **Enforcement** | **Unknown** — `SECURITY DEFINER` vs `INVOKER`, grants, and row checks require live catalog + DDL. |
| **Side effects (rating, audit, logs)** | **Unknown** — not visible in client except indirect hints (`app/page.tsx` message “Elo updated” after home `finish_game` for resign/draw, **not** after moves on `/game/[id]`). |
| **Confidence** | **Low** for backend semantics; **high** only for **call signature** from TS: `p_game_id`, `p_result`, `p_end_reason`. |

**Must inspect (exactly):** `pg_get_functiondef('finish_game')`, `pg_proc.prosecdef`, grants to `authenticated` / `anon`, and any triggers on `games` referencing the same logic.

---

## 63. Phase 8 — C. Backend parity comparison (PATH A vs PATH B)

**PATH A:** `finish_game` — resign, timeout, draw accept (`app/game/[id]/page.tsx`).  
**PATH B:** `persistMove` terminal branch — `gameOverFieldsAfterMove` + `games.update` (`app/game/[id]/page.tsx`).

| Dimension | A (`finish_game`) | B (`persistMove` terminal) | Classification |
|-----------|---------------------|----------------------------|----------------|
| **Client entry** | RPC | Direct `update` + `eq('fen', fenBefore)` | **Divergent** |
| **`status` → finished** | Returned row (assumed) | Patch | **Likely equivalent** *if* RPC only mirrors patch |
| **`result` / `end_reason`** | Caller-supplied enums | From `gameOverFieldsAfterMove` | **Likely equivalent** *value set* for overlapping outcomes |
| **`finished_at`** | Unknown RPC | ISO string in client | **Unknown** |
| **`winner_id`** | Unknown | Set on checkmate in client | **Unknown** |
| **Clock fields** | Unknown | Patched on last move | **Unknown** |
| **`game_move_logs` insert** | Not from this RPC on game page | **Yes** after terminal update | **Divergent** |
| **Rating / audit** | **Possible** in RPC | **Not invoked** | **Divergent** *if* RPC does more than UPDATE |
| **Invariant enforcement** | **Possible** server-side | **RLS / FEN guard only** (RLS not in repo) | **Divergent** / **unknown** |

**Conclusion:** **Structural** backend parity is **not** proven. **Observable UI** parity is **yes** (Phases 6–7). **Backend** parity: **unknown** without DDL; **mechanisms** are **divergent** by construction (RPC vs client UPDATE).

---

## 64. Phase 8 — D. Parity decision

**Selected case: CASE 3 — divergence requires backend unification (recommendation; provisional pending DDL).**

**Justification (evidence-based, no fabrication):**

1. **Repo fact:** Terminal completion **never** calls `finish_game`; PATH A always uses RPC for finished outcomes that aren’t board-derived.  
2. **Repo fact:** `finish_game` body is **opaque**; **cannot** rule out rating, audit, or stricter invariants inside the function.  
3. **Repo fact:** Home `finish_game` UX copy references **Elo**; game-page **terminal** path does not involve that RPC — **plausible skew** if ratings are RPC-scoped.  

**Therefore:** Treat **backend-finish parity as not established.** Do **not** claim CASE 1 (fully equivalent) or CASE 2 (minor, ignorable) without **live** DDL and policy evidence.

**Reclassification rule:** If operators paste DDL showing `finish_game` is **only** a thin `UPDATE games SET …` with **no** rating/audit side effects, and **no** extra invariants beyond what `persistMove` already writes, **downgrade to CASE 1** for product purposes and keep RLS review separate.

**Minimal backend change spec (CASE 3 — do not implement here):**

1. **Option A (preferred for one code path on client):** Extend **`finish_game`** (or add `finish_game_terminal`) to accept **`p_result` / `p_end_reason`** values matching `gameOverFieldsAfterMove` (`checkmate`, `stalemate`, `insufficient_material`, `threefold_repetition`, future `fifty_move` if added). From **`persistMove`**, when `gameOver != null`, call RPC **instead of** raw `update` for the finish fields (after move validation), **or** call RPC once with final FEN validation **server-side**.  
2. **Option B (DB-centric):** `AFTER UPDATE` trigger on **`games`** when **`status`** transitions to **`finished`** that runs shared **rating/audit** logic once, regardless of RPC vs client UPDATE — **must** be idempotent.  
3. **Call-site:** `app/game/[id]/page.tsx` `persistMove` only; **no** matchmaking/tournament changes.  
4. **Expected outcome:** One **authoritative** place for post-finish side effects; terminal and resign/draw/timeout **equivalent** from a backend perspective.

---

## 65. Phase 8 — E. Final trust matrix (all finish paths)

| Path | UI parity | Backend parity vs PATH A | Uses `finish_game`? | Trust level |
|------|-----------|---------------------------|----------------------|-------------|
| **Resign** | **Yes** | **Unknown** (RPC opaque) | **Yes** | **Medium** (blocked on DDL/RLS) |
| **Timeout** | **Yes** | **Unknown** | **Yes** | **Medium** |
| **Draw accept** | **Yes** | **Unknown** | **Yes** | **Medium** |
| **Terminal board** | **Yes** | **Divergent mechanism**; terminal **not** RPC — **unknown** equivalence | **No** | **Low–medium** if RPC has rich side effects |

**Legend:** “**Yes**” UI = `data-result` / `data-end-reason` + shared helpers. **Trust** capped at **medium** until live policies + `finish_game` DDL are ingested.

**Phase 9 supersession:** Terminal board completion **now also calls `finish_game`** after the move-only row patch (see §70+) — treat **Uses `finish_game`?** for terminal as **Yes** post–Phase 9; §65 left as Phase 8 snapshot.

---

## 66. Phase 8 — F. Test coverage review

| Area | Sufficiency for parity *decision* |
|------|-----------------------------------|
| Resign / draw / terminal fool’s mate | **Sufficient** to prove **UI** + **row shape** *as seen by client* after each path. |
| Backend rating / audit | **Insufficient** — **no** automated test without DB assertions or controlled Supabase project. |

**Changes:** **No new tests added** in Phase 8 — existing coverage already ties UI observables to each finish mechanism; adding DB integration tests would violate Phase 8 bounds.

---

## 67. Phase 8 — G. Selectors / helpers

**No changes** — Phase 8 is documentation + parity decision only; **do not** extend `finished-result-summary` further.

---

## 68. Phase 8 — H. Blockers / remaining gaps

| Gap | Severity | Next action |
|-----|----------|-------------|
| **No live DB paste in Phase 8** | **High** for security “proof” | Operator completes §61 table |
| **`finish_game` opaque** | **High** for parity *proof* | Export DDL; update §62 |
| **Backend parity unproven** | **Medium** | Implement **§64** Option A or B when ready |
| **RLS on `games` unknown** | **High** | Same as operator pack |
| **Tests cannot close backend gap** | **Low** | Accept until staging DB harness exists |

---

## 69. Phase 8 — I. Files changed (reason)

| File | Reason |
|------|--------|
| `docs/ACCL-RUNTIME-AUDIT-AND-TEST-PLAN.md` | Phase 8 §61–§69 — live ingest status, parity decision, trust matrix, backend spec |
| `tests/README.md` | Pointer to Phase 8 (no new specs) |

---

## 70. Phase 9 — A. Terminal-finish audit (pre-unification behavior)

| Question | Answer (code) |
|----------|----------------|
| **Where terminal detected** | `persistMove` → `gameOverFieldsAfterMove(nextFen, game!)` after `afterMoveTimingFields`. |
| **Fields in `gameOver`** | `status`, `result`, `winner_id` (mate), `end_reason`, `finished_at`, `move_deadline_at: null`, `draw_offered_by/at: null`. |
| **Pre–Phase 9 patch** | Single `games.update` merged **move fields + gameOver**; optimistic FEN guard. |
| **Move log** | **After** successful update; same `san` / FEN / squares. |
| **`end_reason` values** | `checkmate`, `stalemate`, `insufficient_material`, `threefold_repetition` (no fifty-move branch in `gameOverFieldsAfterMove`). |
| **Result pairing** | Mate → `white_win` / `black_win`; draws → `draw`. |

**Mismatch vs `finish_game` (before Phase 9):** Terminal used **direct UPDATE** for finished columns; resign/timeout/draw used **RPC** — same `result` / `end_reason` strings as intended for banner + PGN, but **different server entrypoint**.

---

## 71. Phase 9 — B. Unification approach

**OPTION A (implemented):** After **legal move** is written with a **move-only** payload (FEN, turn, `last_move_at`, `move_deadline_at`, side clocks when applicable, `status: active` when leaving `waiting`), call:

`finish_game(p_game_id, p_result: gameOver.result, p_end_reason: gameOver.end_reason)`.

**Rationale:** One authoritative finish path; **no** duplicated finished columns in the move `UPDATE`. **Labels unchanged** — same `result` / `end_reason` as `gameOverFieldsAfterMove`.

---

## 72. Phase 9 — C. `result` / `end_reason` contract (unchanged)

| Terminal type | `result` | `end_reason` |
|---------------|----------|--------------|
| Checkmate (White mated) | `black_win` | `checkmate` |
| Checkmate (Black mated) | `white_win` | `checkmate` |
| Stalemate | `draw` | `stalemate` |
| Insufficient material | `draw` | `insufficient_material` |
| Threefold repetition | `draw` | `threefold_repetition` |

**Display** — still driven by `finishedGameResultBannerText` / `terminationPgnTag`; **no** copy changes in Phase 9.

---

## 73. Phase 9 — D. Order of operations (post-change)

1. `games.update(movePatch)` with FEN concurrency guard.  
2. If `gameOver`: `finish_game` → `finalRow` from RPC; else `finalRow` = move response.  
3. On `finish_game` **error:** insert **move log** (move already persisted), `loadGameSnapshot`, surface message — avoids silent loss of the half-move in logs.  
4. `setGame(finalRow)`; **then** move log insert on success path (single insert, no double-log).  
5. `loadMoveLogs` / snapshot refresh unchanged.

**Guards:** Non-terminal moves **never** call `finish_game`. **No** `gameOver` fields in move `UPDATE`.

---

## 74. Phase 9 — E. Tests

| Item | Action |
|------|--------|
| `terminal-finish-checkmate.spec.ts` | **Unchanged** — still asserts `black_win` + `checkmate` on both clients; now backed by move patch + `finish_game`. |
| Resign / draw specs | **Unchanged** helpers. |
| Double-finish | **No** new E2E: would require DB assertions; **not** added. |

---

## 75. Phase 9 — F. Selectors / helpers

**None** — existing `finished-result-summary` / `expectFinishedParitySummary` suffice.

---

## 76. Phase 9 — G. Deferred / backend assumptions

| Topic | Note |
|-------|------|
| **`finish_game` must accept** `p_end_reason` ∈ `{ checkmate, stalemate, insufficient_material, threefold_repetition }` | If production RPC **rejects** these, fool’s mate E2E (or rare terminal lines) will **fail** until SQL allows them. |
| **RPC return row** | Assumed to include final FEN/turn consistent with move patch (as with resign/draw). |
| **Fifty-move / other terminals** | Not produced by current `gameOverFieldsAfterMove`; future adds need RPC alignment. |

---

## 77. Phase 9 — H. PATH A / PATH B status

| Path | After Phase 9 |
|------|-----------------|
| **PATH A** (`finish_game` first-class) | Resign, timeout, draw accept, **and terminal board** — **all** invoke `finish_game` for the **finished** transition. |
| **PATH B** (direct `games.update` for **game-over fields**) | **Removed** for terminal; move **position** still uses direct `update`. Draw offer/decline still direct `update`. |

**Verdict:** **Unified** for **true game-end** semantics on `/game/[id]`, contingent on **`finish_game`** accepting terminal `p_end_reason` values.

---

## 78. Phase 9 — I. Files changed (reason)

| File | Reason |
|------|--------|
| `app/game/[id]/page.tsx` | `persistMove`: move-only patch + `finish_game` on terminal; RPC-fail move-log safeguard |
| `docs/ACCL-RUNTIME-AUDIT-AND-TEST-PLAN.md` | Phase 9 §70–§78; §65 Phase 9 note |
| `tests/README.md` | Phase 9 one-liner |
| `tests/functional/terminal-finish-checkmate.spec.ts` | Comment only — documents `finish_game` backing |

