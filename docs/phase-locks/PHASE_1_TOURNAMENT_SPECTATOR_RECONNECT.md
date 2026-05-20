# Phase 1 — Tournament spectator + reconnect churn (verification)

**Scope:** Stress-test **current** tournament game continuity under player refresh/reconnect and spectator join/leave churn. **No** realtime redesign, new queues, tournament authority changes, or new spectator features.

## Verification matrix

| # | Requirement | Current behavior | Automated |
|---|-------------|------------------|-----------|
| 1 | Player refresh during active tournament game | Source of truth is `games` row; `/game/[id]` refetches via `loadGameSnapshot` on mount, focus, visibility, 2s poll (live/daily `active`/`waiting`). | Script: participant double-read `fen`/`turn`/`status`/`clocks` |
| 2 | Reconnect restores FEN, turn, clocks, move logs, status | Participant: direct `games.select`; spectator: `get_public_spectate_game_snapshot` embeds `game` + ordered `move_logs`. | Script after live move |
| 3 | Multiple spectators join/leave repeatedly | No session table — each visit is `?spectate=1` + RPC. Churn simulated as repeated spectate RPC calls. | Script: 5× spectate fetch |
| 4 | Spectator actions read-only | UI: `isPublicViewer` / `isSpectator` blocks drag + submit paths. API: `submit-move` requires white/black. | Unit grep + script: anon cannot mutate via RPC |
| 5 | Move logs ordered after reconnect | RPC aggregates `game_move_logs` `order by created_at asc`; script checks monotonic timestamps + `fen_after` chain. | Script |
| 6 | Snapshot polling vs Realtime | Both call `scheduleRefresh` → debounced `loadGameSnapshot`. Spectators rely on **RPC snapshot** (2s poll + focus); `game_move_logs` Realtime INSERT often **blocked by RLS** for non-participants. | Unit grep on game page |
| 7 | Finish transition stable with spectators connected | `get_public_spectate_game_snapshot` delegates to `get_public_finished_game_snapshot` when `status=finished`. Polling **stops** at finish — convergence via last poll or focus refresh. | Script: finish + finished RPC |
| 8 | Spectator reconnect after finish | Finished spectate RPC returns `status=finished`, `winner_id`, move history. | Script post-finish spectate |

## Synchronization boundaries (report before patch)

| Boundary | Symptom | Likely cause |
|----------|---------|--------------|
| Logged-in non-participant without `?spectate=1` | Cannot load tournament board | Direct `games` RLS is participant-only |
| Spectator move list stale | Board FEN updates but log list empty | `loadMoveLogs` uses participant RLS; spectator must use RPC-hydrated logs on each `loadGameSnapshot` |
| Finish banner delayed for spectators | Game finished but UI still “active” until tab focus | 2s polling disabled when `status !== active/waiting`; no finished-state poll interval |
| Realtime vs poll “fight” | Duplicate fetches / flicker | Mitigated by `snapshotInFlightRef` + `scheduleRefresh` debounce (~220ms) — not separate competing writers |
| Wrong ecosystem | Spectate RPC returns null | `ecosystem_scope` vs `p_viewer_ecosystem` mismatch |

## Scenario (verification script)

Uses **2 tournament players** + simulated **5 spectators** (repeated spectate RPC).

| Step | Action |
|------|--------|
| 1 | Create 2P KO tournament, register players, bootstrap R1 game |
| 2 | Player reconnect loop: double-read `games` row (FEN, turn, clocks, status) |
| 3 | Apply live move (`apply_move_and_maybe_finish_system`) |
| 4 | Re-read participant + spectate RPC — assert FEN/turn/clocks/logs |
| 5 | Spectator churn: 5× `get_public_spectate_game_snapshot` |
| 6 | Anon client: spectate RPC OK; direct `game_move_logs` empty (RLS) |
| 7 | `finish_game_system` while spectate RPCs still valid |
| 8 | Post-finish spectate RPC shows finished state + ordered logs |

## Prerequisites

- `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Optional: `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon RLS checks)
- Optional: `PHASE_1_SPECTATOR_PLAYER_IDS=p1,p2` (2 distinct profile UUIDs)

## Automated verification

```bash
npm run verify:tournament-spectator-reconnect
```

```bash
npx playwright test tests/unit/tournamentSpectatorReconnect.spec.ts --project=unit
PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test --project=integration-db tests/integration/tournamentSpectatorReconnect.spec.ts
```

Optional: `TOURNAMENT_SPECTATOR_KEEP=1` — leave rows for manual browser drill.

**Pass criteria:** `Phase 1 — tournament spectator + reconnect churn verification PASSED`

## Manual checklist (2 players + 2–5 spectators, browser)

1. Open tournament R1 as **Player A** (`/game/{id}`) and **Player B** on second device.
2. **Spectators** open `/game/{id}?spectate=1` (logged-in or logged-out) — confirm no move controls (`data-spectator-readonly`).
3. **Player A** plays a move; **Player B** refreshes — same FEN/turn/clocks.
4. **Spectators** refresh repeatedly during live play — board matches players.
5. **Spectators** close tab and re-open `?spectate=1` — logs still ordered.
6. **Player B** finishes game (or operator `finish_game_system`); spectators see finished banner/replay state after refresh or tab focus.
7. Confirm tournament hub snapshot does not need to match live FEN (bracket page is one-shot; game page is live source).

## MVP policy (Phase 1 — no new features)

- Tournament spectate links **must** use `?spectate=1` for logged-in non-participants.
- Live tournament boards reconcile via **game row + spectate RPC polling**; treat Realtime as best-effort for spectators.
- Do **not** add spectator session tables or auto-forfeit on disconnect in this phase.
- Browser E2E for full refresh loops remains manual until a dedicated Playwright flow is requested.

## Out of scope (locked)

Realtime architecture redesign, snapshot interval tuning, new spectator features, tournament authority / bracket rule changes, Swiss, bots, payouts, free-play no-show behavior.

## Related

- [PHASE_1_TOURNAMENT_FREEPLAY_COEXISTENCE.md](./PHASE_1_TOURNAMENT_FREEPLAY_COEXISTENCE.md) — minimal spectate RPC probe
- [PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md](./PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md)
- [PHASE_1_TOURNAMENT_NOSHOW_OPS.md](./PHASE_1_TOURNAMENT_NOSHOW_OPS.md)
