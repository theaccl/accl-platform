# Phase 1I-b Lock Snapshot — Shadow enqueue (audit parity)

**Status:** GREEN — SHADOW LOCKED (feature flags OFF in prod default; shadow verified on dev)  
**Locked:** 2026-05-18 (UTC)  
**DB verified:** 2026-05-18 (UTC, `record_bot_move_job_shadow_system` applied)  
**Shadow dev smoke verified:** 2026-05-18 (UTC, `BOT_MOVE_QUEUE_SHADOW=1`, `http://localhost:3001`)  
**Prerequisite:** Phase 1I-a (`docs/phase-locks/PHASE_1IA_BOT_MOVE_JOBS_INFRA_LOCK.md`)

---

## Scope delivered (1I-b)

| Item | Status |
|------|--------|
| `BOT_MOVE_QUEUE_SHADOW` env flag (default **OFF**) | `lib/bot/botMoveQueueFeature.ts` |
| `BOT_MOVE_QUEUE_ENABLED` | **OFF** (unchanged) |
| Shadow writer | `lib/server/botMoveJobShadow.ts` |
| Hook after sync success | `lib/server/submitMoveBotGameCommit.ts` → `finalizeBotGameSuccess` |
| Migration RPC | `record_bot_move_job_shadow_system` → `20260531190000_record_bot_move_job_shadow.sql` **Applied** |
| Unit tests | `tests/unit/botMoveJobShadow.spec.ts`, updates to `botMoveJobsFoundation.spec.ts` |

## Explicitly NOT delivered

- [ ] Internal processor route
- [ ] Async UX / `bot_move_pending`
- [ ] `BOT_MOVE_QUEUE_ENABLED` cutover
- [ ] Queued jobs as authority
- [ ] Phase 1I-c (async cutover)
- [ ] EI / ratings / matchmaking changes

---

## Flag behavior

| Variable | Default | When `1` / `true` / `yes` |
|----------|---------|-------------------------|
| `BOT_MOVE_QUEUE_ENABLED` | OFF | **No effect in 1I-b** (reserved for future async cutover) |
| `BOT_MOVE_QUEUE_SHADOW` | OFF | After successful sync bot commit, call `record_bot_move_job_shadow_system` |

Shadow RPC failure is logged (`bot_move_shadow_failed`) and **does not** change submit-move HTTP response.

---

## Idempotency key

Same as bot `game_move_logs` row (Phase 1F):

- `cm:{clientMoveId}` when client UUID provided, else  
- `mv:{gameId}:{fenBefore}:{playerId}:{fromSq}:{toSq}:{promotion}`

Shadow upserts on unique `(game_id, idempotency_key)`.

---

## Authority

| Layer | Authoritative? |
|-------|----------------|
| `apply_bot_game_turn_system` (sync) | **Yes** |
| `bot_move_jobs` shadow row | **No** (audit only, `status: completed`) |

Synchronous bot path remains authoritative. Shadow rows are audit parity only.

---

## Dev smoke — shadow ON (`BOT_MOVE_QUEUE_SHADOW=1`)

Dev server:

```powershell
cd C:\Users\Chees\accl-platform
$env:BOT_MOVE_QUEUE_SHADOW="1"
$env:PORT="3001"
npm run dev
```

Smoke:

```powershell
cd C:\Users\Chees\accl-platform
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"
$env:ACCL_BASE_URL="http://localhost:3001"
$env:PHASE_1E_WHITE_PROFILE_ID="c278a6d5-6fc5-4f82-a0ea-dbca1a5cee34"
$env:PHASE_1E_BLACK_PROFILE_ID="9bc30963-68d9-41b7-a442-b38c450301d2"
node scripts/phase-1e-transactional-move-log-smoke.mjs --skip-migration
```

| Field | Result |
|-------|--------|
| `BOT_MOVE_QUEUE_SHADOW=1` dev smoke | **Passed** |
| `gameId` | `6207645b-db33-44d9-9dea-99327ac91881` |
| `pliesPlayed` | **4** |
| `moveLogCount` | **4** |
| `replayIntegrity.ok` | **true** |
| `botSettingsPresent` | **true** |
| `errors` | **[]** |

### Shadow DB parity (same game)

| Check | Result |
|-------|--------|
| `bot_move_jobs` shadow rows written | **Yes** |
| Shadow row `status` | **`completed`** |
| `selected_uci` present | **Yes** |
| Queued authority (`status: queued` as move source) | **None** — no queued authority |

---

## Runtime containment (confirmed)

| Gate | Status |
|------|--------|
| `BOT_MOVE_QUEUE_ENABLED` | **OFF** |
| `BOT_MOVE_QUEUE_SHADOW` (prod default) | **OFF** |
| Internal processor route | **Not added** |
| Phase 1I-c async cutover | **Not started** |

---

*Supersede when Phase 1I-c async cutover is approved.*
