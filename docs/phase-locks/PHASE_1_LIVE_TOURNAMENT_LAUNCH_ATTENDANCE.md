# Phase 1 — Live tournament launch attendance

**Scope:** Pre-bracket launch only for **live** tournaments (`tempo = live`). No KO structure change, no mid-round auto-forfeit, no Swiss/round-robin, no bots, no payout changes.

## Live vs async

| Class | `tempo` | Launch attendance gate | Forced redirect / countdown |
|-------|---------|------------------------|-----------------------------|
| **Live** | `live` (bullet/blitz/rapid same-session) | Yes — check-in + presence window | Yes — 20s countdown optional before bootstrap |
| **Async** | `daily`, `correspondence` | No — all registered entrants used | No — host Start calls bootstrap directly |

## Field full (pending)

- Entrants see: **Tournament ready**, **Do not start a new game**, launch-check copy (live).
- Host/moderator sees **Start Tournament** in `TournamentLaunchPanel` (above fold) when `canBootstrap`.
- Others see: **Ready to start — waiting for host/operator**.
- Debug: `?debug=1` on tournament URL (or dev build) exposes `tournament-launch-debug`.

## Launch countdown

1. Host clicks **Start Tournament** on a **live** full pending event.
2. `POST /api/tournaments/[id]/launch-schedule` sets `tournaments.launch_scheduled_at` (now + 20s).
3. UI shows countdown; participants should check in and stay on tournament page.
4. After countdown, host client calls `POST /api/tournaments/[id]/bootstrap` (same persistence path as before).

Async tournaments skip steps 2–3; bootstrap runs immediately.

## Presence source

Migration `20260519180000_tournament_launch_checkin.sql`:

- `tournament_entries.checked_in_at` — explicit **I am here**
- `tournament_entries.last_seen_at` — page heartbeat (`POST .../check-in` without `explicit`)
- `tournament_entries.entry_role` — `entrant` | `standby`
- `tournament_entries.launch_skip_reason` — set for absent at live launch

Present if `checked_in_at` or `last_seen_at` within **10 minutes** of launch (see `LAUNCH_PRESENCE_WINDOW_MS`).

## Replacement rules (launch only)

Before `persistTournamentBracket`:

1. Registered `entrant` rows not present → skipped (`launch_skip_reason = absent_at_live_launch`).
2. `standby` entrants (by seed) fill empty slots until bracket size met.
3. Bracket seeds computed from **final present + promoted** list only.
4. If still fewer than required power-of-2 field → bootstrap **409** `not_enough_present` (tournament stays pending).

No replacement after round 1 has started.

## Operator start path

- `POST /api/tournaments/[id]/bootstrap` — host/moderator; uses `lib/server/tournamentBootstrap.ts`.
- Internal ops bootstrap unchanged; should use same helper when wired.

## Session capture (unchanged scope)

After successful bootstrap:

- Spawned board → redirect `/game/[id]` + message *Tournament started. Taking you to your board.*
- No board yet → tournament shell; global listener still applies post-start.

## Manual / deferred

| Item | Status |
|------|--------|
| Mid-round disconnect / no-show | Manual ops ([PHASE_1_TOURNAMENT_NOSHOW_OPS.md](./PHASE_1_TOURNAMENT_NOSHOW_OPS.md)) |
| Auto-forfeit at launch | **Not implemented** |
| Cron at `starts_at` | **Not implemented** (`starts_at` informational) |
| Standby UI registration | **Deferred** — set `entry_role = standby` via SQL/ops until UI exists |

## Tests

```bash
npm run verify:tournament-launch-attendance
npx playwright test tests/unit/tournamentLaunchAttendance.spec.ts --project=unit
PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test --project=integration-db tests/integration/tournamentLaunchAttendance.spec.ts
```

## Apply migration

```bash
supabase db push
# or apply 20260519180000_tournament_launch_checkin.sql in hosted SQL editor
```

Without migration, snapshot may fail on new columns — apply before testing launch UI.
