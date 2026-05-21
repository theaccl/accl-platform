# Stage 0 Alpha Snapshot

Operational benchmark for invited testers — **not** a feature release tag.

**Deployment candidate:** `bed490b`  
**Status:** Verification **in progress** — do **not** tag `alpha-stage0-20260521` until all gates below are PASS.

---

## Stable anchor

| Source | Commit | Notes |
|--------|--------|--------|
| Pre–Stage 0 production tip | `d8709ad` | Mode room clock activity |
| Stage 0 slices A–E | `da3c39c` … `9b80127` | See rollback table |
| Overlap E2E harness | `5a4f738` | Concurrent pressure spec + runner |
| **Git `main` (GitHub)** | `bed490b` | Current tip |

### Rollback slices

| Slice | SHA | Scope |
|-------|-----|--------|
| A — Spine + identity | `da3c39c` | Login→profile, NEXUS nav/CTA, redirect safety |
| B — NEXUS ops | `205746b` | `operationalGames`, mode lanes, sort order |
| C — Battlefield | `34b48c5` | Lobby continuity, tournament rail, grace API, rating migration **file** |
| D — Play Computer | `a12c17d` | Bot ensure script, provisioning detail, verification runners |
| E — Viewport | `9b80127` | Game shell CSS, grace banner on game page |

---

## Verification results (2026-05-21)

**Operator environment:** local Windows, `.env.local` loaded, `NODE_TLS_REJECT_UNAUTHORIZED=0` (Node TLS workaround for corporate/proxy certs).

| Gate | Result | Evidence |
|------|--------|----------|
| Migration `20260519200000` (Management API) | **FAIL** | `SUPABASE_ACCESS_TOKEN` → Management API **401 Unauthorized** |
| Migration behavior probe (service role RPC) | **INCONCLUSIVE** | `apply_free_play_rating_update` returns `not_authorized` for service-role caller; use SQL editor or refresh token |
| `ensure:play-computer-bots` | **PASS** | All three bot profiles present (Cardi/Aggro/Endgame); `auth_warnings=0` |
| Play Computer prod smoke (`accl-platform.vercel.app`) | **PASS** | balanced/aggressive/defensive/chaos → `source_type: bot_game`, HTTP 200 |
| 4-player KO verification | **PASS** | Registration → bracket → final → champion; cleanup OK |
| Concurrent overlap E2E | **FAIL** | Harness could not complete Find Match pairing on `bed490b` dev shell (route/test drift: `/free` → lobby; Find Match on `/free/play` or mode room). **Re-run after Vercel deploy + selector fix.** |
| Vercel production SHA | **UNCONFIRMED** | Response headers do not expose git SHA; **confirm in Vercel dashboard** deployment for `bed490b` |

### Commands (re-run locally)

```powershell
cd c:\Users\Chees\accl-platform
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'

# Migration — refresh token first, or paste SQL in Supabase SQL Editor
node scripts/apply-supabase-migration.mjs --check 20260519200000_tournament_zero_move_rating_void.sql
npm run verify:migration:zero-move-rating

npm run ensure:play-computer-bots
$env:ACCL_BASE_URL='https://accl-platform.vercel.app'
node scripts/prod-play-computer-smoke.mjs

npm run verify:tournament-4p-ko

# Overlap — production candidate must be deployed; local:
$env:PLAYWRIGHT_BASE_URL='https://accl-platform.vercel.app'
$env:PLAYWRIGHT_SKIP_WEBSERVER='1'
npx playwright test tests/functional/stage0-free-play-overlap-pressure.spec.ts --project=stage0-overlap

npm run verify:stage-0-alpha
```

---

## Deployment truth (required before tag)

1. Vercel **Production** deployment commit must equal **`bed490b`** (full SHA `bed490b6215e2330ee91565b4516ff42787b7241`).
2. GitHub `main` already matches (`git ls-remote origin main`).
3. **Deployment truth supersedes local truth** — prod smoke passed on current Vercel URL; app code on server may still be pre-`bed490b` until deploy completes.

---

## Alpha freeze gate

Tag **only** when every row in the results table is **PASS** and Vercel SHA is confirmed:

```powershell
git tag -a alpha-stage0-20260521 -m "Stage 0 operational alpha: spine, nexus ops, battlefield, sync play computer, viewport shell, overlap pressure"
git push origin main --tags
```

---

## Known limitations (Stage 0 scope)

- No Swiss, tournament bots, async bot queue authority changes, AI mentor, or reconnect sovereignty expansion.
- `supabase db push` requires `SUPABASE_DB_PASSWORD` or valid `SUPABASE_ACCESS_TOKEN`.
- Overlap test uses moderator + non-moderator when `E2E_USER_*` pair unset.
- Play Computer uses configured `BOT_USER_ID_*` (distinct UUIDs in this environment).

---

## Operational expectations (20 invited testers)

| Layer | Expectation |
|-------|-------------|
| **Profile** | Identity spine after login; public stats and history |
| **NEXUS** | Operational obligations only; populated mode lanes; your-move first |
| **Battlefield** | Tournament rail + first-move grace on live KO boards; zero-move finishes must not penalize ratings **after migration applied** |
| **Free play** | Live open pairing, daily rooms, direct challenge via `/free/create` or `/free/play` |
| **Play Computer** | Sync start only; provisioning errors show `detail` text |
| **Observation phase** | Report navigation hesitation, overlap weirdness, trust breaks — not feature requests |

---

## Post-alpha: observation only

Do not expand Swiss, AI mentor, emotional runtime, graphics spirals, or new routes. Stage 0 success means the ecosystem is **observable under real overlap pressure**, not that more systems should be added.
