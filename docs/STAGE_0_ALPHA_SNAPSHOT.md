# Stage 0 Alpha Snapshot

Operational benchmark for invited testers — **not** a feature release tag.

## Stable anchor (verify before tagging)

| Source | Commit | Notes |
|--------|--------|--------|
| Pre–Stage 0 production tip | `d8709ad` | Mode room clock activity (last pushed before Stage 0 slice) |
| Stage 0 slice (5 commits) | `da3c39c` … `9b80127` | See table below |
| Overlap E2E | `5a4f738` | Concurrent free-play pressure spec + runner gate |
| Git `main` (local + GitHub) | `bc536d4` | Stage 0 slices + overlap E2E + snapshot doc tip |
| Vercel production | _fill from deployment detail_ | Must match `bc536d4` before alpha tag |

### Stage 0 commit slices (rollback order)

| Commit | SHA | Scope |
|--------|-----|--------|
| A — Spine + identity | `da3c39c` | Login→profile default, NEXUS nav/CTA, redirect safety, E2E profile shell |
| B — NEXUS ops | `205746b` | `operationalGames`, mode lanes, sort order |
| C — Battlefield | `34b48c5` | Lobby continuity, tournament rail, first-move grace API, zero-move rating migration file |
| D — Play Computer | `a12c17d` | Bot ensure script, provisioning detail, verification runners |
| E — Viewport | `9b80127` | Game shell CSS, grace banner wiring on game page |

Tag alpha only after migration applied in Supabase, verification scripts PASS, and Vercel SHA aligned.

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

### Free Play overlap (concurrent — required)

**Do not rely on serial specs alone.** Stage 0 gate:

```bash
npx playwright test tests/functional/stage0-free-play-overlap-pressure.spec.ts
```

Runs **in parallel**: live seated board + chat + reconnect reload + NEXUS tab + profile tab + lobby tab + daily room tab + outgoing challenge tab + public spectate — same wall-clock window.

| Pressure | How overlap spec exercises it |
|----------|-------------------------------|
| Live | Accepted 5m challenge; both on `/game/[id]` |
| Daily | `/free/lobby/daily` tab while B seated on live board |
| Challenge | Outgoing challenge tab while A on live board |
| Spectator | `?spectate=1` context without chat panels |
| Chat | Game tab sends tester chat while other tabs navigate |
| Reconnect | `pageB.reload()` during overlap |
| Profile / NEXUS | Extra tabs on `/profile` and `/nexus` while games active |

Supplemental serial specs (optional): `free-play-validation`, `launch-convergence-challenge`, `queue-match-free`, `first-move-sync`.

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
