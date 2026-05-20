# Phase 1 — Multi-tournament concurrency (verification)

**Scope:** Verify **two or more** tournaments can run simultaneously without cross-contamination. **No** architecture redesign, distributed recovery, Swiss, bots, or new queue systems.

## Verification matrix

| # | Requirement | Current behavior | Automated |
|---|-------------|------------------|-----------|
| 1 | Multiple tournaments active | Independent `tournaments` rows; each `status=active` after bootstrap. | Script: 2× 4P (optional 4P+8P) |
| 2 | Games tied to correct `tournament_id` | `tournament_try_spawn_game` sets `games.tournament_id`; matches scoped by `tournament_matches.tournament_id`. | Script: row audit |
| 3 | Advancement in A does not affect B | `tournament_handle_finished_game` resolves match by `game_id`; propagation stays on same `tournament_id`. | Script: finish A R1 → B fingerprint unchanged |
| 4 | Snapshot reads isolated | `buildTournamentSnapshot` / match queries filter by `tournament_id`. | Integration |
| 5 | Spectators isolated | `get_public_spectate_game_snapshot` returns `game.tournament_id` for that board only. | Script: spectate both boards |
| 6 | Re-bootstrap on one tournament | `tournament_bootstrap_round(p_tournament_id)` loops R1 for **that** id only. | Script: 2× bootstrap A, B stable |
| 7 | Completion in one bracket | Tournament A `completed`; tournament B remains `active` with own matches. | Script |
| 8 | Free-play coexistence | Busy queries / inserts scope `play_context=free` + `tournament_id is null`. | Script (coexistence pattern) |

## Isolation boundaries (report before patch)

| Boundary | Symptom | Likely cause |
|----------|---------|--------------|
| Wrong `tournament_id` on game | Spectate/hub shows other event | Spawn RPC or manual game insert |
| B advances when A game finishes | Shared `game_id` or bad trigger | Duplicate match→game link (unique index should prevent) |
| Snapshot mixes brackets | Matches from other event | Client passing wrong tournament id to API |
| Free busy includes tournament board | User blocked from free queue incorrectly | `loadFreePlayBusyUserGames` filter regression |
| Re-bootstrap spawns games in B | RPC called without `p_tournament_id` | Operator/script bug |

## Scenario (verification script)

Default: **two simultaneous 4-player** KO tournaments (disjoint entrant sets, 8 profile UUIDs).

| Step | Action |
|------|--------|
| 1 | Create tournament A + B; register 4 each; bootstrap both |
| 2 | Assert all spawned games `tournament_id` matches parent |
| 3 | Finish one R1 game in A; B match rows unchanged |
| 4 | Spectate RPC on A game vs B game — each shows own `tournament_id` |
| 5 | Re-bootstrap A twice; B R1 `game_id`s unchanged |
| 6 | Complete tournament A; B still `active` |
| 7 | Free-play insert/finish; neither bracket mutated |
| 8 | Optional `MULTI_INCLUDE_8P=1`: add 8P tournament C; partial advance; A/B unaffected |

## Prerequisites

- `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **8 distinct profile UUIDs** (`PHASE_1_MULTI_PLAYER_IDS` comma-separated, or ≥8 rows in `profiles`)
- Optional: `MULTI_INCLUDE_8P=1`, `TOURNAMENT_MULTI_KEEP=1`

## Automated verification

```bash
npm run verify:tournament-multi-concurrency
```

```bash
npx playwright test tests/unit/tournamentMultiConcurrency.spec.ts --project=unit
PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test --project=integration-db tests/integration/tournamentMultiConcurrency.spec.ts
```

**Pass criteria:** `Phase 1 — multi-tournament concurrency verification PASSED`

## Manual checklist

1. Ops runs two live 4P events; both hubs show `active`.
2. Finish a semifinal in event A; refresh event B hub — no spurious winners.
3. Spectators on A’s board never see B’s players/FEN.
4. Complete event A; event B still playable.
5. Players can still open free lobby while both events run (per coexistence doc).

## Out of scope (locked)

Global tournament scheduler, cross-event seeding, Swiss, bots, queue systems, automatic multi-tenant recovery.

## Related

- [PHASE_1_TOURNAMENT_RECOVERY.md](./PHASE_1_TOURNAMENT_RECOVERY.md)
- [PHASE_1_TOURNAMENT_FREEPLAY_COEXISTENCE.md](./PHASE_1_TOURNAMENT_FREEPLAY_COEXISTENCE.md)
- [PHASE_1_TOURNAMENT_SPECTATOR_RECONNECT.md](./PHASE_1_TOURNAMENT_SPECTATOR_RECONNECT.md)
- [PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md](./PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md)
- [PHASE_1_TOURNAMENT_8P_KO_VERIFICATION.md](./PHASE_1_TOURNAMENT_8P_KO_VERIFICATION.md)
