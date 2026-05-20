# Phase 1 — Scheduled tournament start + no-show grace (verification)

**Scope:** Verify **current** boundaries for a 4-player KO with `starts_at`, simulated late arrival, and a **30s verification grace** before operator manual award. **No** auto-forfeit, Swiss, bots, payouts, or free-play behavior changes.

## Answers (audit + script)

| # | Question | Current behavior |
|---|----------|------------------|
| 1 | Does tournament enforce `starts_at`? | **No** — column is **informational** (additive migration `20260519165000_tournament_starts_at_additive.sql`). Bracket bootstrap remains **explicit** (`persistTournamentBracket` / ops HTTP / script). Nothing auto-runs at `starts_at`. |
| 2 | Check-in / present / joined-board signal? | **No** dedicated field. Proxies only: `games` row exists; optional `game_move_logs` (absent player may have 0 moves — same as slow player). |
| 3 | Absent vs not moved yet? | **Cannot distinguish reliably** without check-in or move-deadline policy. Both look like `active` game with 0 logs. |
| 4 | No-show timer? | **No** — no grace column, cron, or trigger. Verification uses `NOSHOW_GRACE_SEC=30` in script only. |
| 5 | Operator resolve after grace without corrupting bracket? | **Yes** — `finish_game_system` → `tournament_handle_finished_game` (see [PHASE_1_TOURNAMENT_NOSHOW_OPS.md](./PHASE_1_TOURNAMENT_NOSHOW_OPS.md)). |
| 6 | MVP policy? | See **Recommended MVP policy** below. |

## Recommended MVP policy

1. **Scheduled tournaments** store `starts_at` (UTC) on `tournaments`.
2. **Before start:** registration open while `pending` and no `tournament_matches` (registration gate).
3. **At/after start:** operator (or future job) **bootstraps bracket** → R1 games spawn.
4. **Grace window** (e.g. 2–5 min prod; **30s in verification script only**): players should open assigned `/game/{id}` or be considered for manual no-show.
5. **After grace:** operator awards win to **present** player via `finish_game_system` (`timeout` / `resign` allow-list).
6. **Auto-forfeit:** **deferred** until manual path is proven in ops drills.

## Scenario (verification script)

| Step | Action |
|------|--------|
| 1 | Create 4P KO, `starts_at = now + SCHEDULE_LEAD_SEC` (default 8s) |
| 2 | Register 4 players while `pending` |
| 3 | Confirm bootstrap does **not** auto-run at `starts_at` |
| 4 | Wait until `starts_at`, operator bootstrap bracket |
| 5 | Designate one player absent (no moves / no “check-in”) |
| 6 | Wait `NOSHOW_GRACE_SEC` (default 30s) — game stays `active` |
| 7 | Operator `finish_game_system` for **present** player |
| 8 | Confirm `tournament_matches.winner_id` and no spurious auto-forfeit |

## Prerequisites

- Migrations through `20260519165000_tournament_starts_at_additive.sql` applied.
- `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Automated verification

```bash
npm run verify:tournament-scheduled-start-noshow
```

Optional:

- `PHASE_1_4P_PLAYER_IDS` — four UUIDs
- `SCHEDULE_LEAD_SEC=8` — seconds until simulated start (use `2` for quick local)
- `NOSHOW_GRACE_SEC=30` — grace before operator award
- `TOURNAMENT_SCHEDULED_KEEP=1` — leave rows

```bash
PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test --project=integration-db tests/integration/tournamentScheduledStartNoshow.spec.ts
```

**Pass criteria:** `Phase 1 — scheduled start + no-show grace verification PASSED`

## Manual checklist (2–3 users, browser)

1. Create tournament with `starts_at` ~2 minutes ahead (SQL or future UI).
2. Four testers register; confirm lobby **reminder** only ([coexistence](./PHASE_1_TOURNAMENT_FREEPLAY_COEXISTENCE.md)).
3. At start time, ops bootstraps bracket; each player receives game link.
4. Three open boards; one stays away through grace.
5. Operator confirms absent match still **In progress** on snapshot.
6. After grace, operator awards present player (service-role SQL or runbook).
7. Absent player’s next-round slot does not receive spurious wins; bracket continues when other matches finish.

## Failure triage

| Symptom | Boundary |
|---------|----------|
| `starts_at column missing` | Migration not applied |
| Auto bootstrap at clock | New job/trigger (out of scope) — would violate “manual first” |
| Cannot tell absent vs slow | No check-in signal — product gap, not bracket bug |
| Game forfeited during grace | Unexpected cron/RPC — report path |
| Wrong winner after operator award | [PHASE_1_TOURNAMENT_NOSHOW_OPS.md](./PHASE_1_TOURNAMENT_NOSHOW_OPS.md) |

## Out of scope (locked)

Auto-forfeit, check-in UI, `starts_at` enforcement cron, Swiss, bots, payouts, free-play no-show changes.

## Related

- [PHASE_1_TOURNAMENT_NOSHOW_OPS.md](./PHASE_1_TOURNAMENT_NOSHOW_OPS.md)
- [PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md](./PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md)
