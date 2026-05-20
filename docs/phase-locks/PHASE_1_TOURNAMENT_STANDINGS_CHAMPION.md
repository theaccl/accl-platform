# Phase 1 — Tournament standings + champion snapshot (verification)

**Scope:** Verify tournament-facing **read models** reflect bracket truth before, during, and after completion. **No** standings UI redesign, payouts, Swiss, rating recalculation, or new trophy logic.

## Read-model sources

| Layer | Role |
|-------|------|
| `buildTournamentSnapshot` | Service-role hub snapshot: `entries`, `matches`, `gameStatusById`, `boardStatus` per match |
| `championUserIdFromTournament` / `findFinalMatch` | Client derives champion from **final match `winner_id`** when `status === 'completed'` |
| Trophy emitter | `emit_trophy_for_tournament_champion` — separate; **not** part of snapshot (out of scope unless broken) |

Snapshot does **not** embed free-play ratings or non-tournament `games` except via match-linked `game_id` statuses.

## Verification matrix

| # | Requirement | Current behavior | Automated |
|---|-------------|------------------|-----------|
| 1 | Pending: registered entrants | `tournament_entries` rows; snapshot `entries[]` when insider/creator | Script + integration |
| 2 | Active: bracket, seeds, game IDs, statuses | Matches from `tournament_matches`; `boardStatus` via `matchBoardStatus` + `games.status` | Script |
| 3 | Partial: resolved / live / future | `winner_id` + `game_id` + game status drive chips | Script |
| 4 | Final only when finalists known | Final `game_id` null until both R1 winners seated | Script |
| 5 | Completed: status + champion | `tournaments.status=completed`; champion = terminal match `winner_id` | Script |
| 6 | No free-play confusion | Snapshot loads only match `game_id`s; no rating columns | Unit grep |
| 7 | Stable repeated reads | Same fingerprint across double `buildTournamentSnapshot` | Script + integration |
| 8 | Multi-tournament isolation | Champion derived per `tournament_id` | Script (2× 4P) |

## Read-model boundaries (report before patch)

| Boundary | Symptom | Likely cause |
|----------|---------|--------------|
| Champion shown while `active` | UI ignores `championUserIdFromTournament` guard | Client bug |
| Champion wrong but DB correct | `findFinalMatch` picks wrong terminal node | Multiple terminal matches / bad `next_match_id` |
| Pending entrant missing | RLS / snapshot visibility (non-insider) | Expected for public; not a bracket bug |
| `boardStatus` stale | Hub one-shot fetch; game page is live FEN source | Not standings bug |
| Trophy without champion | Emitter `champion_missing` | Final not finished — separate from snapshot |

## Scenario (verification script)

4-player KO with seeds 1–4:

| Phase | Assert |
|-------|--------|
| Pending | 4 `tournament_entries`, 0 matches |
| Active (bootstrapped) | 3 matches; R1 `game_id`s; seeds 1–4; final `ready`/`waiting` |
| Partial (1 R1 done) | 1 `resolved`, 1 `live`; final no `game_id` |
| Both R1 done | Final has both players + `game_id` |
| Completed | `status=completed`; champion = final `winner_id` |
| Free-play | Unrelated game not in match `game_id` set |
| Multi | Two events → distinct champions |

## Prerequisites

- `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Optional: `PHASE_1_4P_PLAYER_IDS`, `TOURNAMENT_STANDINGS_KEEP=1`

## Automated verification

```bash
npm run verify:tournament-standings-champion
```

```bash
npx playwright test tests/unit/tournamentStandingsChampion.spec.ts --project=unit
PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test --project=integration-db tests/integration/tournamentStandingsChampion.spec.ts
```

**Pass criteria:** `Phase 1 — tournament standings + champion snapshot verification PASSED`

## Manual checklist

1. Pending hub: four entrants listed (creator/participant view).
2. After bootstrap: bracket shows R1 boards + links; final “ready” or waiting.
3. Mid-event: one semifinal resolved, one live; final not started.
4. After event: champion banner matches final winner on profile link.

## Out of scope (locked)

Standings UI redesign, payouts, Swiss table, Elo recalculation, trophy emitter changes.

## Related

- [PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md](./PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md)
- [PHASE_1_TOURNAMENT_RECOVERY.md](./PHASE_1_TOURNAMENT_RECOVERY.md)
- [PHASE_1_TOURNAMENT_MULTI_CONCURRENCY.md](./PHASE_1_TOURNAMENT_MULTI_CONCURRENCY.md)
- [PHASE_1_TOURNAMENT_FREEPLAY_COEXISTENCE.md](./PHASE_1_TOURNAMENT_FREEPLAY_COEXISTENCE.md)
