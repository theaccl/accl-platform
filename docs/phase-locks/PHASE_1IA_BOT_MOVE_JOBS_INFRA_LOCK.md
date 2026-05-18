# Phase 1I-a Lock Snapshot — `bot_move_jobs` infrastructure

**Status:** GREEN — INFRA LOCKED (feature flag OFF — no cutover)  
**Locked:** 2026-05-18 (UTC)  
**DB verified:** 2026-05-18 (UTC, live Supabase)  
**Sync smoke verified:** 2026-05-18 (UTC, `http://localhost:3001`)  
**Baseline role:** Queue foundation only; synchronous bot path unchanged. Queue is **not** authoritative for moves.

**Prerequisite locks:** 1E–1H, EI doctrine (no EI build).

---

## Scope delivered (1I-a)

| Item | Status |
|------|--------|
| Migration `20260531180000_bot_move_jobs_queue_foundation.sql` | **Applied** (Supabase SQL Editor) |
| Table `public.bot_move_jobs` + indexes + RLS | Live |
| RPCs: enqueue, claim, complete, fail, stale, get-for-game | Live |
| `lib/bot/botMoveJobTypes.ts` | Types only |
| `lib/bot/botMoveQueueFeature.ts` | `BOT_MOVE_QUEUE_ENABLED` default **OFF** |
| Unit/static tests | `tests/unit/botMoveJobsFoundation.spec.ts` (6 passed) |

---

## Live DB verification (service role)

Probe game: `3949264a-5529-4d21-8581-18b9d1e6fe05`  
Bot seat: `9bc30963-68d9-41b7-a442-b38c450301d2`

| Check | Result |
|-------|--------|
| `bot_move_jobs` table readable | **OK** |
| `get_bot_move_job_for_game` | **OK** |
| `enqueue_bot_move_job` | **OK** |
| Enqueued job id | `5919cee6-76f1-48b0-9f30-25e3c031ec52` |
| Idempotency (same `game_id` + idempotency key) | **Same `job_id`** on repeat enqueue |
| `claim_next_bot_move_job` | **OK** → `status: running` |
| `complete_bot_move_job` | **OK** → `true` |

Idempotency key used in probe: `mv:verify:1i-a:3949264a`  
Post-human FEN used in probe: `rnbqkbnr/p2ppppp/1p6/2p5/3PP3/8/PPPP2PPP/RNBQKBNR b KQkq - 0 3`

---

## Final sync-smoke confirmation (post 1I-a, authoritative path)

Command: `node scripts/phase-1e-transactional-move-log-smoke.mjs --skip-migration`  
Host: `ACCL_BASE_URL=http://localhost:3001` (after port cleanup; single Next listener on `:3001`)

| Field | Result |
|-------|--------|
| Synchronous bot execution (composite RPC in-request) | **Still works** after 1I-a |
| `ok` | **true** |
| `final_status` / smoke completion | **completed** |
| `rpcAcceptsMoveLog` | **true** |
| `botSettingsPresent` | **true** |
| `ratingLastUpdateHasBotConfig` | **false** |
| `pliesPlayed` / `moveLogCount` | **4** / **4** |
| `replayIntegrity.ok` | **true** |
| Analysis enqueue/process | **Completed** |
| `errors` | **[]** |

**Architectural note:** `bot_move_jobs` infrastructure **exists** (table + RPCs verified separately) but is **not authoritative** for game state. Authoritative commit remains `apply_bot_game_turn_system` via sync `submit-move` → `commitBotGameTurn`.

---

## Runtime containment (confirmed)

| Gate | Status |
|------|--------|
| `BOT_MOVE_QUEUE_ENABLED` | **OFF** (unset / `0` / `false`; helper unused in production paths) |
| Submit-move cutover | **None** — still `commitBotGameTurn` → `apply_bot_game_turn_system` |
| Internal processor route (`/api/internal/bot-move-queue`) | **Not added** |
| Phase 1I-b shadow enqueue | **Not started** |
| Async UX / client polling | **Not started** |
| EI implementation | **Not started** |

---

## Explicitly NOT delivered

- [ ] Phase 1I-b shadow enqueue
- [ ] Submit-move integration
- [ ] Internal processor route
- [ ] Async UX / client polling
- [ ] EI implementation

---

## Feature flag

`BOT_MOVE_QUEUE_ENABLED` unset / `0` / `false` → queue **disabled** in app helpers (`lib/bot/botMoveQueueFeature.ts`). No production path calls `enqueue_bot_move_job`.

---

## References

- Plan: `docs/plans/PHASE_1I_BOT_MOVE_JOBS_PLAN.md`
- Next phase (plan only): `docs/plans/PHASE_1I_B_SHADOW_ENQUEUE_PLAN.md`
- Migration: `supabase/migrations/20260531180000_bot_move_jobs_queue_foundation.sql`
- Prerequisite: `docs/phase-locks/PHASE_1H_BOT_SETTINGS_LOCK.md`

---

*Supersede this lock when Phase 1I-b is approved and implemented.*
