# Phase 1 — Tournament ↔ Free Play coexistence verification

**Scope:** Pressure-test **operational isolation** between tournament bracket games and normal free play. Warn-only UX; no new queue systems, reconnect redesign, bots, Swiss, or auto-forfeit.

## Verification matrix

| # | Requirement | Current behavior | Automated |
|---|-------------|------------------|-----------|
| 1 | User in tournament can access Nexus, spectate, chat | **Nexus:** no server gate blocking tournament participants. **Spectate:** `get_public_spectate_game_snapshot` works for tournament `games` (ecosystem match). **Chat:** game page assigns `table` vs `spectator` lanes by seat + `?spectate=1`; seated players strip spectate query (player lane). | DB: spectate RPC. Manual: Nexus nav, chat lanes |
| 2 | Live free-play restrictions do not corrupt tournament state | `loadFreePlayBusyUserGames` filters `play_context=free` + `tournament_id is null`. Supersede/join guards same. | Script + integration |
| 3 | Tournament game routing wins | `/game/[id]` loads row by id; `tournament_id` shows `TournamentCoexistenceNotice` + link to `/tournaments/[id]`. Free-only affordances gated (`play_context === 'free' && !tournament_id`). | Unit grep + manual |
| 4 | Daily/correspondence coexistence | `userHasConflictingPlatQueueSlot` returns null for `daily` target; daily rows do not block live slot. Host busy skip for async join in guard migration. | Unit + script (p1 daily + tournament live) |
| 5 | Reconnect restores tournament board | Source of truth is `games` row (`fen`, `status`, clocks); reload refetches same id. | Script double-read |
| 6 | Spectators do not gain tournament authority | Spectate RPC read-only; no move RPC without auth participant; analysis artifacts blocked for `publicSpectate`. | Script + code review |
| 7 | Tournament completion does not orphan live state | Finishing one bracket game does not `finish` unrelated free rows; supersede scopes `tournament_id is null`. | Script |
| 8 | Free open seats/challenges do not mutate bracket | `create_seated_game_guard` rejects `tournament_id` open seats; free inserts do not update `tournament_matches`. | Script + integration |

## UX (warn-only)

| Surface | Component | Behavior |
|---------|-----------|----------|
| Tournament board | `TournamentCoexistenceNotice` `on_tournament_board` | Link back to tournament hub |
| Free lobby | `TournamentCoexistenceNotice` `lobby_reminder` | Reminder if another active tournament board exists |
| Policy | Comment in component | **Informational only** — does not mutate queue or gameplay |

## Manual operator checklist (2–3 users)

Use when automated script passes but product wants browser confidence:

1. **User A** in live tournament game; open **Nexus** → no error; return to `/game/{tournamentGameId}`.
2. **User B** spectates `?spectate=1` on A’s tournament board → no move controls; chat lane spectator.
3. **User A** opens **Lobby Chat** → sees tournament reminder; can still post open seat / accept unrelated challenge if PLAT slot allows.
4. **User A** refresh tournament tab → same FEN/turn; clocks consistent.
5. **User A** finishes a **free** daily game while tournament live → tournament match row unchanged in snapshot.
6. **User C** cannot join A’s tournament URL as black via free open-seat join (wrong RPC path / error).

## Automated verification

```bash
npm run verify:tournament-freeplay-coexistence
# or
node scripts/tournament-freeplay-coexistence-verification.mjs
```

```bash
npx playwright test tests/unit/tournamentFreeplayCoexistence.spec.ts
PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test --project=integration-db tests/integration/tournamentFreeplayCoexistence.spec.ts
```

Optional: `PHASE_1_COEXIST_PLAYER_IDS=uuid1,uuid2,uuid3`  
Optional: `TOURNAMENT_COEXISTENCE_KEEP=1`

**Pass criteria:** `Phase 1 — tournament ↔ free-play coexistence verification PASSED`

## Authority boundaries (triage)

| Symptom | Boundary |
|---------|----------|
| Live queue blocks tournament player incorrectly | `loadFreePlayBusyUserGames` / client pre-check using unfiltered `games` |
| Tournament match `game_id` cleared after free join | `create_seated_game_guard` / supersede touching `play_context=tournament` |
| Open seat join lands on bracket game | `create_seated_game_guard` open-row validation (`not a free-play open seat`) — requires **authenticated** RPC; service role hits `not authenticated` first (manual checklist) |
| Seated player stuck in spectate lane | `app/game/[id]/page.tsx` spectate strip effect |
| Daily blocked by live tournament | `freePlayQueueSlotConflict` / guard host-busy branch |
| Bracket advances when free game ends | `trg_games_tournament_finish_advance` only on that `game_id` |

## Out of scope (locked)

Swiss, tournament bots, async bot queue, reconnect authority redesign, auto-forfeit, new queue systems, forced single-game mutex across contexts.

## Related

- Registration gate (separate): `lib/server/tournamentRegistrationGate.ts`
- [PHASE_1_TOURNAMENT_NOSHOW_OPS.md](./PHASE_1_TOURNAMENT_NOSHOW_OPS.md)
- [PHASE_1_TOURNAMENT_SPECTATOR_RECONNECT.md](./PHASE_1_TOURNAMENT_SPECTATOR_RECONNECT.md) — refresh/reconnect + spectator churn
- [PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md](./PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md)
