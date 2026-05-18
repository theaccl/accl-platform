# Phase 1I-b Plan — Shadow Enqueue (audit parity only)

> **Implemented (1I-b).** Lock: `docs/phase-locks/PHASE_1IB_BOT_MOVE_SHADOW_LOCK.md`  
> Apply migration `20260531190000_record_bot_move_job_shadow.sql` before enabling shadow in an environment.

**Goal:** After each successful **synchronous** bot turn commit, optionally write a `bot_move_jobs` row for observability and future worker parity—**without** changing authoritative game state or client behavior.

---

## 1) Problem statement

Phase 1I-a delivered queue **infrastructure** (table + RPCs + feature flag OFF). Sync bot play still commits via `commitBotGameTurn` → `apply_bot_game_turn_system`.

1I-b adds a **shadow write path** so we can:

- Prove enqueue payloads match what sync commit already applied
- Build metrics on job shape, idempotency keys, and timing
- De-risk a future worker (1I-c+) without async cutover

---

## 2) Non-negotiable constraints

| Rule | Detail |
|------|--------|
| **Authority** | `apply_bot_game_turn_system` remains sole commit path |
| **Flag default** | `BOT_MOVE_QUEUE_ENABLED` stays **OFF** in production until explicit unlock |
| **Shadow mode** | New env e.g. `BOT_MOVE_QUEUE_SHADOW=1` only enables enqueue **after** sync success |
| **No client change** | Response shape unchanged: `bot_move_applied`, `think_ms`, `row` as today |
| **No processor** | No `/api/internal/bot-move-queue/process` in 1I-b |
| **No async UX** | No `bot_move_pending`, no polling contract |
| **Enqueue failure** | Must **not** fail the user move if shadow enqueue fails (log + metric only) |

---

## 3) Shadow enqueue trigger point

**File:** `lib/server/submitMoveBotGameCommit.ts`  
**When:** After `apply_bot_game_turn_system` returns success **and** `botMoveApplied === true` (bot ply was part of composite).

**Do not enqueue when:**

- Human terminal move (no bot ply)
- `botMoveApplied === false`
- Game not `bot_game`
- Feature flag off and shadow flag off

---

## 4) Shadow payload mapping

Map from values already computed in sync path:

| Job column | Source |
|------------|--------|
| `game_id` | `gameId` |
| `post_human_fen` | FEN after human ply (pre-bot selection FEN / `pre.fenNow`) |
| `bot_player_id` | `pre.sideToMoveUserId` |
| `idempotency_key` | Same key as bot `game_move_logs` row (`buildMoveIdempotencyKey`) |
| `correlation_id` | `submit-move` trace id (new optional header or generated uuid per request) |
| `status` (initial) | `completed` immediately **or** `queued` with instant `complete_bot_move_job` |

**Recommended 1I-b shape:** enqueue as **`completed`** shadow rows (not `queued`) to avoid implying pending work:

1. Call `enqueue_bot_move_job(...)` (deduped)
2. Immediately call `complete_bot_move_job(job_id, selected_uci, think_ms)` with UCI already applied

Alternative (simpler RPC): add `record_bot_move_job_shadow_system(...)` migration that inserts a completed row in one shot—only if enqueue+complete feels awkward for shadow semantics.

**Default recommendation:** reuse `enqueue` + `complete` so RPC surface stays exercised without a worker.

---

## 5) Idempotency alignment

- Shadow job `idempotency_key` **must equal** bot move-log idempotency key for that ply.
- Unique `(game_id, idempotency_key)` → repeat submit returns same job id (no duplicate shadow rows).
- If sync commit was idempotent duplicate, shadow enqueue should no-op or match existing job (same as move log recovery).

---

## 6) Observability

**Logs (auditApiLog or prodLog):**

- `bot_move_shadow_enqueue_ok`
- `bot_move_shadow_enqueue_failed` (with error message, never surfaced to client)

**Metrics (optional JSON log fields):**

- `game_id`, `job_id`, `selected_uci`, `think_ms`, `shadow: true`

**No user-facing error** on shadow failure.

---

## 7) Feature flags

| Variable | 1I-a | 1I-b (proposed) |
|----------|------|------------------|
| `BOT_MOVE_QUEUE_ENABLED` | OFF | OFF (still no cutover) |
| `BOT_MOVE_QUEUE_SHADOW` | n/a | OFF default; `1` in dev/staging for shadow writes |

`isBotMoveQueueShadowEnabled()` in `lib/bot/botMoveQueueFeature.ts` (or sibling helper).

---

## 8) Files to touch (implementation checklist — not started)

| File | Change |
|------|--------|
| `lib/bot/botMoveQueueFeature.ts` | Add `isBotMoveQueueShadowEnabled()` |
| `lib/server/submitMoveBotGameCommit.ts` | Post-success shadow enqueue (try/catch, non-blocking) |
| `lib/server/botMoveJobShadow.ts` | **New** — `recordShadowBotMoveJob(...)` wrapper around RPCs |
| `tests/unit/botMoveJobsFoundation.spec.ts` | Shadow flag static tests |
| `tests/unit/botMoveJobShadow.spec.ts` | **New** — payload mapping unit tests |
| `scripts/phase-1e-transactional-move-log-smoke.mjs` | Optional: assert shadow job row exists when `BOT_MOVE_QUEUE_SHADOW=1` |

**Not in 1I-b:**

- `app/api/game/submit-move/route.ts` behavior change (beyond calling existing commit helper)
- Processor route
- Client UI

---

## 9) Verification plan (when implemented)

### Unit / static

- Shadow off → no `enqueue_bot_move_job` in commit path
- Shadow on → enqueue+complete called with mapped fields
- Enqueue error swallowed; sync response still `ok: true`

### Manual / service role

After one computer game ply with shadow on:

```sql
select id, game_id, status, idempotency_key, selected_uci, think_ms, correlation_id
from public.bot_move_jobs
where game_id = '<game_id>'
order by created_at desc
limit 5;
```

Expect: `status = completed`, `selected_uci` matches committed bot ply, key matches move log.

### Regression

- Re-run Phase 1E smoke with shadow **off** → identical to 1I-a lock (authoritative path only)
- Re-run with shadow **on** → smoke still green; optional extra row in `bot_move_jobs`

---

## 10) Success criteria (1I-b lock)

- [ ] Sync smoke green with shadow **off**
- [ ] Sync smoke green with shadow **on**
- [ ] Shadow rows `completed` with matching UCI/idempotency key
- [ ] Shadow enqueue failure does not break submit-move
- [ ] `BOT_MOVE_QUEUE_ENABLED` still off
- [ ] No processor route
- [ ] No submit-move cutover / no async UX

---

## 11) Explicit deferrals (1I-c+)

- Async bot reply (human committed, bot pending)
- Internal processor worker
- Client polling / “computer thinking” UX
- Shadow vs worker selection diff automation (can be 1I-c)

---

## 12) References

- Infra lock: `docs/phase-locks/PHASE_1IA_BOT_MOVE_JOBS_INFRA_LOCK.md`
- Parent plan: `docs/plans/PHASE_1I_BOT_MOVE_JOBS_PLAN.md`
- Sync commit: `lib/server/submitMoveBotGameCommit.ts`
- RPCs: `supabase/migrations/20260531180000_bot_move_jobs_queue_foundation.sql`

---

*Plan only. Do not implement until explicitly approved.*
