# ACCL — Session Lock Snapshot

**Status:** GREEN — STABLE ANCHOR FROZEN  
**Locked:** 2026-05-19 (UTC)  
**Stable anchor:** `main` @ `8c57c86` — *Stabilize Nexus trainer handoffs and lobby computer routing*

**Prerequisite locks:** Phase 1H, 1I-a, 1I-b (`docs/phase-locks/PHASE_1H_BOT_SETTINGS_LOCK.md`, `PHASE_1IA_BOT_MOVE_JOBS_INFRA_LOCK.md`, `PHASE_1IB_BOT_MOVE_SHADOW_LOCK.md`)

---

## Stable anchor

```text
main @ 8c57c86
```

---

## Verified stable (environment)

| Check | Result |
|-------|--------|
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| `GET /api/health` | **OK** |
| Queue flags default OFF | **Confirmed** (`BOT_MOVE_QUEUE_ENABLED`, `BOT_MOVE_QUEUE_SHADOW`) |
| Processor route | **Not present** |
| Async authority | **Not enabled** |

---

## Verified Play Computer scope

### Visible only in

- `/free/lobby/bullet`
- `/free/lobby/blitz`
- `/free/lobby/rapid`

### Excluded from

- `/free/lobby/daily`
- `/free/play` (legacy)
- Hub routes (`/free/lobby` hub tiles only — no in-room panel)

### Verified

| Item | Status |
|------|--------|
| `COMPUTER_PLAY_PLAT_MODES` | bullet / blitz / rapid only |
| `platModeExposesComputerPlay` | gates room panel |
| `data-testid="free-lobby-play-computer-panel"` | present on live mode rooms |
| `tests/unit/freeLobbyPlayComputer.spec.ts` | **13/13** passing |

---

## Nexus ↔ Trainer stabilization (complete)

### Updated

| File | Change |
|------|--------|
| `components/nexus/OnboardingPanel.tsx` | `/free/play` → `/free/lobby` |
| `components/nexus/PersonalHook.tsx` | `/free/play` → `/free/lobby` |
| `components/nexus/LiveGamesModule.tsx` | `/free/play` → `/free/lobby` |
| `components/nexus/StandingsExpanded.tsx` | `/free/play` → `/free/lobby` |
| `lib/nexus/nexusHubMapping.ts` | static hub hrefs: `/trainer`, `/trainer/computer` |
| `app/trainer/page.tsx` | Arena handoffs → Nexus + Lobby Chat |

### Added

- `tests/unit/nexusTrainerHandoff.spec.ts`

### Verified

- Nexus components route to `/free/lobby` (not legacy `/free/play`)
- Trainer home includes Arena handoff links (`trainer-hub-nexus-link`, `trainer-hub-lobby-link`)
- `/trainer/computer` remains **sandbox-only** practice
- Live Play Computer remains **lobby mode-room scoped** (Bullet / Blitz / Rapid)
- Combined unit tests: **20/20** (`freeLobbyPlayComputer` + `nexusTrainerHandoff`)

---

## Architectural state

### Authoritative

```text
apply_bot_game_turn_system  (sync submit-move → commitBotGameTurn)
```

### Non-authoritative / frozen (do not build without explicit approval)

```text
bot_move_jobs (audit / infra only when shadow ON)
BOT_MOVE_QUEUE_ENABLED
processor route (/api/internal/bot-move-queue)
async queue execution
Phase 1I-c
EI runtime
Tournament bots
Daily computer games
```

---

## Important ops note

```text
GET /api/health/system → 503 (local probe)
```

Current evidence strongly suggests:

- env / service dependency availability
- local remote-dependency hydration
- or service-role configuration — **not** app-layer regression

**Do not treat this as architecture instability.**

---

## Next recommended sequence

```text
1. Freeze current stable state          ← this snapshot
2. Tester prep
3. Reliability instrumentation
4. Tournament operational verification
5. ONLY THEN evaluate Phase 1I-c
```

---

## Current product topology

```text
Nexus   = live ecosystem command center
Lobby   = entry / activity / mode rooms
Trainer = analysis / sandbox / improvement

Computer Play (live):
  - mode-room scoped (Bullet, Blitz, Rapid)

Trainer Computer:
  - isolated practice (/trainer/computer)
```

This separation is structurally coherent at `8c57c86`.

---

*Supersede when Phase 1I-c async cutover is approved or a new stable anchor is declared.*
