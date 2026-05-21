# Stage 0 Alpha Snapshot

Operational benchmark for invited testers — **not** a feature release tag.

## Stable anchor (verify before tagging)

| Source | Commit | Notes |
|--------|--------|--------|
| Git `main` (local) | `d8709ad` | Last pushed: mode room clock activity |
| GitHub `main` | `d8709ad` | Confirm matches `git ls-remote origin main` |
| Vercel production | _fill from deployment detail_ | Must match intended anchor or newer Stage 0 commit |

**Working tree:** Stage 0 spine / NEXUS ops / bot provisioning / battlefield continuity may be **uncommitted** after `d8709ad`. Tag alpha only after those commits are on `main` and deployed.

---

## Constitutional locks (unchanged)

- Profile = identity
- NEXUS = operations
- Battlefield = tournament legitimacy
- Engine truth supremacy; queue containment; finished-only analysis intake
- No Swiss, tournament bots, async bot queue authority changes, or AI mentor in Stage 0

---

## Verification checklist

Run from repo root (requires network + `.env.local`):

```bash
node scripts/stage-0-alpha-verification.mjs
```

Or step-by-step:

| # | Step | Command |
|---|------|---------|
| 1 | Rating void migration | `node scripts/apply-supabase-migration.mjs 20260519200000_tournament_zero_move_rating_void.sql` |
| 2 | Bot profiles | `npm run ensure:play-computer-bots` |
| 3 | Play Computer (prod/staging) | `ACCL_BASE_URL=https://accl-platform.vercel.app node scripts/prod-play-computer-smoke.mjs` |
| 4 | Free Play matrix | See Playwright list in `stage-0-alpha-verification.mjs` output |
| 5 | 4p KO | `npm run verify:tournament-4p-ko` |

### Free Play matrix (expected coverage)

| Flow | Primary test / surface |
|------|-------------------------|
| Live create/join | `tests/functional/free-play-validation.spec.ts` |
| Daily game | `tests/functional/queue-match-free.spec.ts` (when daily path enabled) |
| Open pairing | `tests/functional/free-play-validation.spec.ts` (Find Match) |
| Direct challenge | `tests/functional/launch-convergence-challenge.spec.ts` |
| Accept redirect priority | `tests/unit/gameAcceptRedirectPriority.spec.ts` |
| Spectator | `tests/unit/gameSpectatorSurface.spec.ts` + lobby watch row |
| Chat continuity | `tests/unit/chatApiSurface.spec.ts` + `gameTesterChatSurface` |
| Finished-game continuity | `tests/unit/finishedGameDetailPage.spec.ts` |

### Bot provisioning

- Env: all three `BOT_USER_ID_*` set to **distinct UUIDs**, or **all unset** (defaults `10000000-…001/002/003`).
- Each selected bot must have `profiles` row (and `auth.users` when using custom IDs).
- Sync start: `POST /api/bot/game/start` — no async all-bot audit on this path.

---

## Results log (fill after run)

**Date:** ___________  
**Operator:** ___________  
**Supabase project:** `nlptviibefbzisyqswuv`  
**ACCL_BASE_URL:** ___________

| Check | Result | Notes |
|-------|--------|-------|
| Migration `20260519200000` | ☐ PASS ☐ FAIL | |
| `ensure:play-computer-bots` | ☐ PASS ☐ FAIL | |
| Play Computer smoke | ☐ PASS ☐ FAIL | |
| Free Play E2E subset | ☐ PASS ☐ SKIP | |
| 4p KO verification | ☐ PASS ☐ FAIL | |
| Vercel deploy SHA | | |

---

## Alpha tag (only if all PASS)

```bash
git tag -a alpha-stage0-YYYYMMDD -m "Stage 0 operational alpha: spine, nexus ops, bot sync, KO smoke"
```

Do not force-push `main`. Redeploy Vercel from tagged commit and confirm deployment SHA.

---

## Known gaps / out of scope

- Swiss, tournament bots, reconnect sovereignty expansion
- Trainer / AI mentor / visual polish
- Phase 2 observability dashboard
- `supabase db push` requires `SUPABASE_DB_PASSWORD` or Management API token (`apply-supabase-migration.mjs`)
