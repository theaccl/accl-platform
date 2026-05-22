# ACCL Starting Position / Opening Encyclopedia — audit & design

**Status:** Audit / design only (no implementation in this slice).  
**Reason:** Starting position choice affects **all** game-creation surfaces, not only Play Computer.  
**Hard rule:** Opening Encyclopedia is a **pre-game reference layer** — no live engine advantage, no in-game analysis authority.

---

## Executive summary

| Capability | Today |
|------------|--------|
| Standard chess start | **Yes** — universal default via `lib/startFen.ts` → `START_FEN` |
| FEN-based custom start (product) | **No** — app inserts always use `START_FEN`; DB RPC *can* accept `payload.fen` but nothing sends it |
| ECO / opening preset start | **No** — no tables, APIs, or UI |
| Trainer / repertoire selected position → new game | **No** — `trainer_generated_positions.fen` exists; no create-game wiring |
| Bot selected opening | **No** — `botGameInsert` fixes `START_FEN` |
| Tournament non-standard start | **No** — `tournament_try_spawn_game` hardcodes start FEN in SQL |

**MVP boundary (recommended):** Free Play + Play Computer may later select encyclopedia entries; **tournaments remain standard-only** until explicitly approved.

**Safe hooks today (infra only, not product-ready):** `games.fen` as runtime SOT; `create_seated_game_guard` optional `payload.fen`; `verifyGameReplayIntegrity({ startFen })`; game board `normalizeFenForReactChessboard`. **Not safe end-to-end** without fixing replay UI, PGN export, insert contracts, and `turn` ↔ FEN side alignment.

---

## 1. Current-state map

### 1.1 Where initial position is set

| Surface | Code path | Initial FEN | Notes |
|---------|-----------|-------------|--------|
| **Play Computer** | `POST /api/bot/game/start` → `botGameInsert()` | `START_FEN` | Body: difficulty, personality, time control only |
| **Direct Challenge** | `match_requests` insert → accept → `gameInsertFromAcceptedChallenge()` | `START_FEN` | Request row has no FEN / opening fields |
| **Open pairing / Create game** | `runFreePlayCreateGame` → `buildOpenSeatRow` → `openSeatNewGameInsert` | `START_FEN` | Direct `games.insert` (bypasses guard on create) |
| **Find match / join open seat** | `createSeatedGameGuard` or join listing accept | `START_FEN` in app payload | Guard **could** use `payload.fen` if client sent it |
| **Free Play casual 2p** | `casualTwoPlayerGameInsert` | `START_FEN` | Home / legacy paths |
| **Rematch** | `match_requests` + `gameInsertFromAcceptedChallenge` | `START_FEN` | `source_game_id` carried; position not |
| **Tournament bracket** | `tournament_try_spawn_game` (SQL) | Hardcoded in migration | Not `START_FEN` import — same standard FEN string |
| **Trainer practice game** | *Not implemented* | — | `trainer_generated_positions` stores FEN from finished games; no game bootstrap |
| **Bot move (server)** | `app/api/bot/game/[id]/move` | Reads `games.fen` | Would work **if** row had custom FEN at insert |

Canonical constant:

```7:8:lib/startFen.ts
/** Canonical starting FEN for DB rows and clients; avoid literal `'start'` (react-chessboard). */
export const START_FEN = new Chess().fen();
```

Shared insert contract (`lib/gameStartupInsert.ts`): every exported helper sets `fen: START_FEN`, `turn: 'white'`.

### 1.2 `games` table / non-standard FEN

- **Column:** `games.fen` (text) — **source of truth during play** (`submit-move`, bot move, board sync).
- **Insert paths:** App always writes standard start; `create_seated_game_guard` reads `payload->>'fen'` and defaults to standard if null (see `20260529120000_create_seated_game_guard_live_busy_excludes_async.sql`).
- **No repo migration** found that constrains `fen` to standard start only — non-standard FEN is *technically storable* if written via service role or raw SQL.
- **`turn` column:** Always `'white'` at insert regardless of FEN side-to-move — **misalignment risk** if custom FEN were injected without syncing `turn` from FEN token 2.

### 1.3 Move validation

| Layer | Assumption |
|-------|------------|
| **Client** (`app/game/[id]/page.tsx`) | `Chess` loaded from `game.fen`; optimistic `fenBefore` from client |
| **`POST /api/game/submit-move`** | Validates move against `gameRow.fen` / `fenBefore`; uses `new Chess(fen)` — **position-agnostic** if FEN is legal |
| **DB RPCs** (`apply_move_*`, `finish_game_*`) | `p_expected_fen` vs stored `games.fen` — **no “must be move 1 from start” rule** |
| **Bot** | `new Chess(game.fen)` — works for any legal FEN |

**Conclusion:** Move pipeline is **FEN-driven**, not “ply 1 from standard board” driven. Risk is **metadata** (`turn`, replay, PGN), not core legality checks.

### 1.4 Replay / move logs

| Component | Standard-only? |
|-----------|----------------|
| `lib/replay/gameReplayIntegrity.ts` | **Supports** optional `startFen`; first log `fen_before` or `startFen` |
| `hooks/useReplayState.ts` | Accepts `startFen` param — **caller must pass correct start** |
| **Game board UI** | `useReplayState(sanForDisplay, START_FEN)` — **hardcoded standard** (line ~811) |
| **PGN export** (`buildPgn`) | Movetext only; **no `[SetUp "1"]` FEN tag** — custom starts export incorrectly |
| **Move logs** | `fen_before` / `fen_after` per ply — chain works if first ply’s `fen_before` matches game start |

### 1.5 Bot start + custom FEN

- Start route: **no** `fen` / `openingId` in request body.
- After start: bot logic uses **`games.fen`** — safe **only if** insert stored correct FEN + `turn`.
- `select-move` API: candidate lines from client — **no encyclopedia coupling**.

### 1.6 Challenge / open-seat APIs

| Table / API | `starting_fen` / `starting_position_id` |
|-------------|----------------------------------------|
| `match_requests` | **Absent** — tempo, clock, colors, rated only |
| `games` | `fen` only (no FK to encyclopedia) |
| Challenge accept / join-open-listing | Builds row via `gameInsertFromAcceptedChallenge` → `START_FEN` |

### 1.7 Tournaments

- `tournament_try_spawn_game`: **fixed** standard FEN in SQL; no hook.
- **Policy:** Remain standard-only for MVP (matches product boundary).

---

## 2. Opening Encyclopedia (design — reference layer)

**Not** live engine authority. Canonical catalog for pre-game setup and labeling.

### 2.1 Proposed entity (future `opening_encyclopedia_entries` or similar)

| Field | Purpose |
|-------|---------|
| `id` | UUID PK |
| `eco_code` | e.g. `B90` (nullable for non-ECO puzzles) |
| `opening_name` | Family name |
| `variation_name` | Sub-line label |
| `move_sequence` | SAN or UCI plies from standard start **or** parent entry |
| `resulting_fen` | Canonical FEN after sequence |
| `side_to_move` | `white` \| `black` (redundant but ops-friendly) |
| `validation` | JSON: legality proof, ply count, checksum, validator version |
| `tags` | `text[]` — beginner, aggressive, defensive, gambit, trap, endgame, trainer, … |
| `source` / `version` | Provenance (lichess eco dump, ACCL v1, manual curator) |
| `active` | Soft-disable bad rows |

**Indexes:** `eco_code`, GIN on `tags`, unique on `(source, version, resulting_fen)` optional.

**Runtime use:** Game create stores `games.fen` (+ optional `games.opening_encyclopedia_id` FK). Encyclopedia row is **copied at start**, not consulted during play.

### 2.2 Hard rule compliance

- No engine lines stored as “recommended moves” in encyclopedia.
- Selection UI runs **before** `games.insert`; no mid-game encyclopedia queries for move hints.
- Trainer “practice from position” may **display** encyclopedia metadata post-select only.

---

## 3. Required DB / API changes (when implementing)

### 3.1 Database

1. **`opening_encyclopedia_entries`** (new table) — schema above.
2. **`games`** (optional additive):
   - `opening_encyclopedia_id uuid null references …`
   - `starting_fen text null` — snapshot at create (or rely on `fen` only)
3. **`match_requests`** (if challenges can agree on position):
   - `opening_encyclopedia_id uuid null`
   - or `starting_fen text null` (denormalized; validate on accept)
4. **Constraints / RPC:**
   - `validate_opening_fen(fen) → boolean` (legal position, ≤32 pieces, both kings, etc.)
   - `create_seated_game_guard`: set `turn` from FEN token 2 when custom `fen` provided
   - **Do not** change `tournament_try_spawn_game` until product approves

### 3.2 API / app

| Endpoint / module | Change |
|-------------------|--------|
| `POST /api/bot/game/start` | Optional `openingEncyclopediaId` or `fen` (validated server-side) |
| Free Play create/find | Pass validated FEN into insert payload |
| `match_requests` create/accept | Optional opening id; copy to `games` on accept |
| `lib/gameStartupInsert.ts` | Parameterize `fen` + derive `turn` from FEN |
| Game page replay | `useReplayState(..., game.initialFen ?? game.fen at ply 0)` |
| PGN export | `[SetUp "1"]` + `[FEN "..."]` when start ≠ standard |
| Read-only catalog | `GET /api/openings/catalog` (paginated, filter by tag/eco) — **no engine** |

### 3.3 Tests

- Unit: FEN validation, `turn` derivation, replay integrity with `startFen`
- Integration: bot + open-seat create with encyclopedia row → play one move → finish
- Negative: illegal FEN, wrong side `turn`, tournament spawn unchanged

---

## 4. Risk list

| Risk | Severity | Detail |
|------|----------|--------|
| Replay UI wrong for custom start | **High** | `useReplayState(..., START_FEN)` ignores actual start |
| PGN export misleading | **High** | No SetUp/FEN header; movetext assumes move 1 = standard |
| `turn` vs FEN mismatch | **High** | Inserts force `turn: 'white'` while FEN may say `b` to move |
| Partial DB support without app | **Med** | Manual SQL custom FEN → confusing UX / broken replay |
| Challenge negotiation | **Med** | Both players must agree on opening id before accept |
| Bot + custom FEN | **Med** | Works at move layer; test promotion/castling rights in FEN |
| Rating / anti-cheat semantics | **Med** | Non-standard starts may need `rated=false` or separate bucket |
| Tournament scope creep | **High** | SQL hardcoded FEN — must stay locked until explicit approval |
| Encyclopedia stale/wrong FEN | **Med** | Requires validation metadata + versioned imports |
| “Live analysis advantage” perception | **High** | Any in-game hint tied to encyclopedia violates doctrine — keep pre-game only |

---

## 5. MVP recommendation

### Phase A — Data + read API only (no game create change)

1. Ship `opening_encyclopedia_entries` + seed script (ECO subset + trainer tags).
2. `GET /api/openings/catalog` (read-only, cached).
3. Document tournament **standard-only** lock in phase-lock doc.

### Phase B — Play Computer + open-seat create (smallest playable)

1. Extend `botGameInsert` / `POST /api/bot/game/start` with optional `openingEncyclopediaId`.
2. Server: resolve entry → `fen` + `turn`; validate; insert.
3. Fix game page replay start FEN + PGN SetUp tag.
4. Verification script (like KO/no-show slices).

### Phase C — Direct challenge + match_requests

1. Add optional `opening_encyclopedia_id` on challenge create; show on accept UI.
2. Copy to game on accept.

### Phase D — Trainer practice

1. “Play from this position” from `trainer_generated_positions` or encyclopedia entry.
2. Still `play_context: 'free'`, `rated: false` default.

### Explicitly defer

- Tournament custom starts
- In-game opening hints / engine tied to encyclopedia
- Repertoire builder UX (link entries only)

---

## 6. Audit checklist (requested items)

| # | Question | Answer |
|---|----------|--------|
| 1 | Where creation sets FEN | `lib/gameStartupInsert.ts` (all app paths); SQL for tournaments; `create_seated_game_guard` optional `payload.fen` |
| 2 | `games` supports non-standard? | **Column yes; product no** |
| 3 | Move validation assumes standard? | **No** — uses current `games.fen` |
| 4 | Replay/logs custom FEN? | **Library yes; game UI no**; logs OK if `fen_before` chain correct |
| 5 | Bot custom FEN safe? | **After insert only**; start route does not accept it |
| 6 | Challenge APIs carry position id/fen? | **No** |
| 7 | Tournaments standard-only for now? | **Yes** — enforce in SQL + policy; do not change in MVP |

---

## 7. Implementation gate

**Do not implement** in code until:

- [ ] Product signs off MVP surfaces (Computer + Free Play create/find first).
- [ ] `turn`↔FEN derivation utility + tests exist.
- [ ] Replay + PGN fixes scoped in same PR as first custom-FEN create path.

**Existing safe hooks insufficient alone** — require app-layer contract + UI fixes above.

---

## Related

- `lib/startFen.ts`, `lib/gameStartupInsert.ts`, `lib/replay/gameReplayIntegrity.ts`
- `docs/ACCL-RUNTIME-AUDIT-AND-TEST-PLAN.md` §27 Phase 4 startup contract
- `supabase/migrations/20260426120000_trainer_pattern_pipeline_foundation.sql`
- Tournament locks: `PHASE_1_TOURNAMENT_*_KO_VERIFICATION.md`
