# Phase 1 — Tournament recovery / interrupted flow (verification)

**Scope:** Verify tournaments remain **operationally recoverable** after interruptions or partial progression. **No** architecture redesign, automatic recovery jobs, Swiss, bots, or new queue systems.

## Verification matrix

| # | Requirement | Current behavior | Automated |
|---|-------------|------------------|-----------|
| 1 | Survives operator/browser refresh during active round | `tournaments` + `tournament_matches` + `games` rows persist; repeated reads stable. | Script: double-read tournament hub state |
| 2 | Partial round (one finished, one active) | `tournament_handle_finished_game` advances only finished feeder; sibling R1 game stays `active`. | Script: finish one R1 semifinal only |
| 3 | Advancement correct after reload | Winner on finished match; final not spawned until both R1 complete. | Script + integration |
| 4 | Re-run bootstrap does not duplicate | `tournament_process_bye_or_spawn` returns when `game_id` or `winner_id` set; `tournament_matches_game_id_unique`. | Script: 2× `tournament_bootstrap_round` |
| 5 | Stalled round recoverable by operator | Remaining R1 finished via `finish_game_system`; final spawns when both feeders done. | Script |
| 6 | Completion stable after interruption | Full 4P path to `tournaments.status = completed` after mid-round stall. | Script |
| 7 | Free-play during interruption | Free insert/finish does not mutate `tournament_matches`. | Script (coexistence pattern) |
| 8 | Snapshot reads coherent after interruption | `buildTournamentSnapshot` / repeated match+game reads agree on statuses. | Integration + script fingerprint |

## Recovery boundaries (report before patch)

| Boundary | Symptom | Likely cause |
|----------|---------|--------------|
| Duplicate R1 games after re-bootstrap | Two `games` rows for one match | `game_id` cleared manually or spawn bypass — violates `tournament_try_spawn_game` guard |
| Final spawned with one R1 done | Wrong feeder propagation | `tournament_propagate_winner` / `advance_winner_as` mismatch |
| Tournament stuck `active` after final | Completion trigger | `trg_games_tournament_finish_advance` or final game not `finished` |
| Snapshot shows wrong board state | Stale client cache | Hub snapshot is one-shot fetch; game page is live source for FEN |
| `persistTournamentBracket` on `active` | Throws or idempotent return | `precheckBracketPersist` — matches exist → `idempotent_return`, no re-insert |

## Scenario (verification script)

4-player KO, live tempo:

| Step | Action |
|------|--------|
| 1 | Register 4, bootstrap R1 (2 games) |
| 2 | Operator reload simulation: repeated tournament/match reads |
| 3 | Finish **one** R1 game only → partial round |
| 4 | Spectator RPC on finished + active games |
| 5 | Re-run `tournament_bootstrap_round` twice → same `game_id`s, no extra games |
| 6 | Insert/finish unrelated free game → tournament rows unchanged |
| 7 | Operator finishes second R1 → final spawns |
| 8 | Operator reload + snapshot fingerprint |
| 9 | Finish final → `completed` |
| 10 | Post-completion reads still coherent |

## Prerequisites

- `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Optional: `PHASE_1_4P_PLAYER_IDS` (4 UUIDs)
- Optional: `TOURNAMENT_RECOVERY_KEEP=1`

## Automated verification

```bash
npm run verify:tournament-recovery
```

```bash
npx playwright test tests/unit/tournamentRecovery.spec.ts --project=unit
PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test --project=integration-db tests/integration/tournamentRecovery.spec.ts
```

**Pass criteria:** `Phase 1 — tournament recovery / interrupted flow verification PASSED`

## Manual checklist (operator + 2–4 players)

1. Start 4P KO; open tournament hub in two browser tabs; refresh both during R1 — bracket unchanged.
2. Finish one semifinal; refresh hub — one resolved, one in progress, final not live.
3. Re-run ops bootstrap (if exposed) — no duplicate game links.
4. Finish second semifinal; confirm final appears.
5. Player opens free challenge in parallel — tournament match rows unchanged.
6. Complete final after brief disconnect; hub shows `completed`.

## Out of scope (locked)

Automatic recovery cron, Swiss, tournament bots, queue systems, realtime/snapshot redesign, reconnect authority changes.

## Related

- [PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md](./PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md)
- [PHASE_1_TOURNAMENT_FREEPLAY_COEXISTENCE.md](./PHASE_1_TOURNAMENT_FREEPLAY_COEXISTENCE.md)
- [PHASE_1_TOURNAMENT_SPECTATOR_RECONNECT.md](./PHASE_1_TOURNAMENT_SPECTATOR_RECONNECT.md)
- [PHASE_1_TOURNAMENT_NOSHOW_OPS.md](./PHASE_1_TOURNAMENT_NOSHOW_OPS.md)
