# Phase 1 — Tournament hardening freeze audit

**Status:** Freeze classification (verification compression). **No** new product features, migrations, UI redesign, Swiss, bots, payout automation, or trophy emitter work in this document.

**Frozen line:** `main` @ `1adc35d` (2026-05-20) — includes all tournament verification slices through standings + champion snapshot.

**Purpose:** Give operators and testers a single map of **what is proven**, **how to re-verify**, **known boundaries**, and **what must not be casually changed**.

---

## How to read classifications

| Class | Meaning |
|-------|---------|
| **stable** | Automated script and/or unit tests pass on linked Supabase; suitable for **controlled tester** drills with documented caveats |
| **manual-ops** | Requires operator/service-role steps and/or browser checklist; MVP default for edge cases |
| **future-work** | Boundary documented; behavior intentionally deferred |
| **do-not-touch** | Authority / bracket / finish pipeline — change only with new phase-lock + full re-verify |

---

## Verified anchors

### Play Computer (production smoke passed)

| Field | Value |
|-------|--------|
| **Commit** | `f97c8f2` (*Fix Play Computer start: scope bot provisioning to selected bot only*); lobby/trainer scope locked earlier @ `8c57c86` |
| **Verify** | `tests/unit/freeLobbyPlayComputer.spec.ts`; production: `node scripts/prod-play-computer-smoke.mjs` (script **uncommitted** — local only; needs `ACCL_BASE_URL`, E2E moderator creds) |
| **Proves** | Play Computer starts only selected bot; panel gated to bullet/blitz/rapid lobby rooms; not on tournament paths |
| **Known boundary** | Not tournament scope; prod smoke is HTTP against deployed app, not DB bracket |
| **Class** | **stable** (free-play lobby); prod smoke = **manual-ops** checklist |

**Phase-lock:** `docs/phase-locks/SESSION_LOCK_SNAPSHOT.md`

---

### 4-player KO

| Field | Value |
|-------|--------|
| **Commit** | `74f212a` |
| **Verify** | `npm run verify:tournament-4p-ko` |
| **Proves** | Registration → bracket → R1 (2 games) → advancement → final → `tournaments.status=completed` → champion on final match |
| **Known boundary** | Service-role script; happy-path manual KO only; `finish_game_system` with allowed `end_reason` |
| **Class** | **stable** (controlled tester + ops re-run); bracket SQL = **do-not-touch** |

**Phase-lock:** [PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md](./PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md)

---

### 8-player KO

| Field | Value |
|-------|--------|
| **Commit** | `2bfda45` |
| **Verify** | `npm run verify:tournament-8p-ko` |
| **Proves** | 8-entrant single-elimination through quarterfinals → champion; same advancement chain as 4P |
| **Known boundary** | May provision auth users if &lt;8 profiles; not a load test |
| **Class** | **stable**; bracket authority = **do-not-touch** |

**Phase-lock:** [PHASE_1_TOURNAMENT_8P_KO_VERIFICATION.md](./PHASE_1_TOURNAMENT_8P_KO_VERIFICATION.md)

---

### No-show ops

| Field | Value |
|-------|--------|
| **Commit** | `8b33a12` |
| **Verify** | `npm run verify:tournament-noshow-ops` |
| **Proves** | Operator `finish_game_system` (`timeout` / `resign`) awards seated player; bracket advances; draw does not advance absent slot |
| **Known boundary** | **Manual operator only** — no auto-forfeit; `forfeit` / `no_show` rejected by `games_end_reason_check` |
| **Class** | **manual-ops** (MVP policy); finish/advance triggers = **do-not-touch** |

**Phase-lock:** [PHASE_1_TOURNAMENT_NOSHOW_OPS.md](./PHASE_1_TOURNAMENT_NOSHOW_OPS.md)

---

### Scheduled start + grace boundary

| Field | Value |
|-------|--------|
| **Commit** | `6234eec` (includes migration `20260519165000_tournament_starts_at_additive.sql`) |
| **Verify** | `npm run verify:tournament-scheduled-start-noshow` |
| **Proves** | `starts_at` storable; **not enforced** by cron; early bootstrap does not auto-run at clock; after grace, operator award works |
| **Known boundary** | No check-in signal; 30s grace is **verification-only**; apply migration on remote DB before script passes |
| **Class** | **manual-ops** for real schedules; `starts_at` column = **stable** representation; enforcement = **future-work** |

**Phase-lock:** [PHASE_1_TOURNAMENT_SCHEDULED_START_NOSHOW.md](./PHASE_1_TOURNAMENT_SCHEDULED_START_NOSHOW.md)

---

### Tournament ↔ free-play coexistence

| Field | Value |
|-------|--------|
| **Commit** | `27770ee` |
| **Verify** | `npm run verify:tournament-freeplay-coexistence` |
| **Proves** | Tournament games excluded from free busy; join guard rejects tournament as open seat; parallel free/daily does not mutate bracket |
| **Known boundary** | `TournamentCoexistenceNotice` is **warn-only**; does not block queue |
| **Class** | **stable** for isolation rules; UX reminder = **stable** |

**Phase-lock:** [PHASE_1_TOURNAMENT_FREEPLAY_COEXISTENCE.md](./PHASE_1_TOURNAMENT_FREEPLAY_COEXISTENCE.md)

---

### Spectator + reconnect churn

| Field | Value |
|-------|--------|
| **Commit** | `2e6d21d` |
| **Verify** | `npm run verify:tournament-spectator-reconnect` |
| **Proves** | Player reload reads stable; spectate RPC FEN/turn/logs; read-only for non-participants; finish transition via RPC |
| **Known boundary** | Logged-in spectators need `?spectate=1`; hub snapshot one-shot; **finish banner may lag** until tab focus (polling stops at `finished`) |
| **Class** | **stable** (RPC/DB); spectator finish UI lag = **future-work** / manual refresh |

**Phase-lock:** [PHASE_1_TOURNAMENT_SPECTATOR_RECONNECT.md](./PHASE_1_TOURNAMENT_SPECTATOR_RECONNECT.md)

---

### Recovery / interrupted flow

| Field | Value |
|-------|--------|
| **Commit** | `c08055b` |
| **Verify** | `npm run verify:tournament-recovery` |
| **Proves** | Partial R1; re-bootstrap idempotent; operator can finish stalled R1; completion after interruption; free-play does not mutate bracket |
| **Known boundary** | No automatic recovery job; hub FEN not live — game page is board SOT |
| **Class** | **stable** + **manual-ops** for real disconnects; auto-recovery = **future-work** |

**Phase-lock:** [PHASE_1_TOURNAMENT_RECOVERY.md](./PHASE_1_TOURNAMENT_RECOVERY.md)

---

### Multi-tournament concurrency

| Field | Value |
|-------|--------|
| **Commit** | `cfe1bfa` |
| **Verify** | `npm run verify:tournament-multi-concurrency` |
| **Proves** | Two 4P events active; `tournament_id` isolation; advancement/finish/completion in A does not mutate B; spectate RPC scoped |
| **Known boundary** | Requires 8 profile UUIDs; optional `MULTI_INCLUDE_8P=1` |
| **Class** | **stable** for parallel ops drills |

**Phase-lock:** [PHASE_1_TOURNAMENT_MULTI_CONCURRENCY.md](./PHASE_1_TOURNAMENT_MULTI_CONCURRENCY.md)

---

### Standings + champion snapshot

| Field | Value |
|-------|--------|
| **Commit** | `1adc35d` |
| **Verify** | `npm run verify:tournament-standings-champion` |
| **Proves** | Pending entrants; active bracket + `boardStatus`; partial/final gating; completed champion = final `winner_id`; multi-event champion isolation |
| **Known boundary** | Champion derived in UI via `championUserIdFromTournament`; snapshot has no Elo; trophy emitter **not** verified here |
| **Class** | **stable** read-model; standings **UI redesign** = **future-work** |

**Phase-lock:** [PHASE_1_TOURNAMENT_STANDINGS_CHAMPION.md](./PHASE_1_TOURNAMENT_STANDINGS_CHAMPION.md)

---

## Consolidated classification (MVP)

### 1. Stable enough for controlled tester use

- 4P / 8P KO happy path (with service-role or ops-run scripts)
- Tournament ↔ free-play isolation (warn-only coexistence UI)
- Multi-tournament parallel events (disjoint test data)
- Standings/champion hub snapshot (creator/participant/insider views)
- Spectator `?spectate=1` on tournament boards (expect possible finish UI lag)
- Play Computer in bullet/blitz/rapid lobby (not tournament)

### 2. Manual operator-only for MVP

- No-show / missing player resolution (`finish_game_system`, `timeout`/`resign`)
- Scheduled `starts_at` (informational) + bracket bootstrap at go-time
- Recovery after partial round / stalled semifinal
- Production Play Computer smoke (`prod-play-computer-smoke.mjs` when run against Vercel)

### 3. Deferred until later

- Automatic no-show / forfeit
- Dedicated check-in / presence signal
- `starts_at` enforcement cron
- Automatic multi-tournament recovery
- Swiss format + Swiss standings
- Payout automation
- Trophy emitter changes / champion trophy UX
- Opening Encyclopedia product implementation (see audit-only doc below)
- Spectator finished-state polling
- Realtime architecture redesign

### 4. Must not be casually touched

- `tournament_try_spawn_game` / `tournament_bootstrap_round` / `tournament_handle_finished_game` / `tournament_propagate_winner`
- `finish_game_system` + `games_end_reason_check` allow-list
- `persistTournamentBracket` / `precheckBracketPersist` idempotency
- `create_seated_game_guard` tournament rejection (`tournament_id` / `play_context`)
- `buildTournamentSnapshot` visibility + match scoping
- `get_public_spectate_game_snapshot` ecosystem gate
- Free-play busy queries (`play_context=free`, `tournament_id is null`)

---

## Remaining risks (explicit)

| Risk | Status | Mitigation today |
|------|--------|------------------|
| No automatic no-show/forfeit | Open | Operator manual award per [NOSHOW_OPS](./PHASE_1_TOURNAMENT_NOSHOW_OPS.md) |
| No dedicated check-in signal | Open | Cannot distinguish absent vs slow; ops judgment + grace (verify only) |
| Tournaments standard-position only | Open | SQL `tournament_try_spawn_game` hardcodes start FEN |
| No Swiss yet | Open | Single-elimination verification only |
| No payout automation | Open | Out of Phase 1 tournament hardening |
| No trophy emitter changes | Open | `emit_trophy_for_tournament_champion` exists; not in verify matrix |
| Spectator finish UI may lag until refresh/focus | Open | Documented in [SPECTATOR_RECONNECT](./PHASE_1_TOURNAMENT_SPECTATOR_RECONNECT.md) |
| Opening Encyclopedia | **Audit-only, uncommitted** | `docs/phase-locks/OPENING_ENCYCLOPEDIA_AUDIT.md` — do not treat as shipped |
| `starts_at` migration on remote DB | Ops | Apply `20260519165000_tournament_starts_at_additive.sql` if using scheduled verify |
| Play Computer prod smoke script | Local | `scripts/prod-play-computer-smoke.mjs` not on `main` |

---

## Re-verify checklist (operator)

Prerequisites: `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; 4–8 profile UUIDs as needed.

```bash
npm run verify:phase-1-tournament-freeze
```

Runs all tournament hardening scripts in sequence (stops on first failure). Individual commands remain in [package.json](../../package.json) under `verify:tournament-*`.

Optional unit/integration spot checks:

```bash
npx playwright test tests/unit/tournamentStandingsChampion.spec.ts --project=unit
PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test --project=integration-db tests/integration/tournamentRecovery.spec.ts
```

---

## Phase-lock index (tournament hardening)

| Doc | Slice |
|-----|--------|
| [PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md](./PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md) | 4P KO |
| [PHASE_1_TOURNAMENT_8P_KO_VERIFICATION.md](./PHASE_1_TOURNAMENT_8P_KO_VERIFICATION.md) | 8P KO |
| [PHASE_1_TOURNAMENT_NOSHOW_OPS.md](./PHASE_1_TOURNAMENT_NOSHOW_OPS.md) | No-show ops |
| [PHASE_1_TOURNAMENT_SCHEDULED_START_NOSHOW.md](./PHASE_1_TOURNAMENT_SCHEDULED_START_NOSHOW.md) | Scheduled start |
| [PHASE_1_TOURNAMENT_FREEPLAY_COEXISTENCE.md](./PHASE_1_TOURNAMENT_FREEPLAY_COEXISTENCE.md) | Free-play coexistence |
| [PHASE_1_TOURNAMENT_SPECTATOR_RECONNECT.md](./PHASE_1_TOURNAMENT_SPECTATOR_RECONNECT.md) | Spectator reconnect |
| [PHASE_1_TOURNAMENT_RECOVERY.md](./PHASE_1_TOURNAMENT_RECOVERY.md) | Recovery |
| [PHASE_1_TOURNAMENT_MULTI_CONCURRENCY.md](./PHASE_1_TOURNAMENT_MULTI_CONCURRENCY.md) | Multi-tournament |
| [PHASE_1_TOURNAMENT_STANDINGS_CHAMPION.md](./PHASE_1_TOURNAMENT_STANDINGS_CHAMPION.md) | Standings/champion |
| [OPENING_ENCYCLOPEDIA_AUDIT.md](./OPENING_ENCYCLOPEDIA_AUDIT.md) | **Uncommitted audit only** |

---

## Controlled real-user ops (documentation)

Operator and tester playbooks derived from this audit (no new product features):

| Doc | Audience |
|-----|----------|
| [TOURNAMENT_OPERATOR_RUNBOOK.md](../ops/TOURNAMENT_OPERATOR_RUNBOOK.md) | Moderators — create, run, no-show, recovery, rollback, bug triage |
| [TESTER_ONBOARDING_CHECKLIST.md](../ops/TESTER_ONBOARDING_CHECKLIST.md) | Testers — registration, play, spectate, report |
| [KNOWN_PHASE1_BOUNDARIES.md](../ops/KNOWN_PHASE1_BOUNDARIES.md) | Quick reference — risks, spectator, coexistence, do-not-touch |

---

## Out of scope for Phase 1 freeze (locked)

Architecture redesign, new migrations, standings UI redesign, Swiss, tournament bots in bracket, async bot queue authority, payout logic, distributed recovery, realtime optimization, new spectator features.
