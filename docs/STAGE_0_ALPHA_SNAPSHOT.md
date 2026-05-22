# Stage 0 Alpha Snapshot

Operational benchmark for invited testers — **not** a feature release tag.

**Freeze SHA:** `7c655fe` (`7c655fee1b77467035d7c7abb92780dc94e33c7d`)  
**Tag:** `alpha-stage0-20260521`  
**Status:** **FROZEN** — Vercel Production, GitHub `main`, and local `main` aligned on `7c655fe`.

---

## Stable anchor

| Source | Commit | Notes |
|--------|--------|--------|
| Pre–Stage 0 production tip | `d8709ad` | Mode room clock activity |
| Stage 0 slices A–E | `da3c39c` … `9b80127` | See rollback table |
| Overlap E2E harness | `5a4f738` | Concurrent pressure spec + runner |
| Harness reproducibility | `ccdf8ae` | Blitz mode room, pair-scoped teardown, create/find pairing |
| Snapshot finalize | `7c655fe` | **Alpha freeze tip** — harness + snapshot table |
| **Vercel Production** | `7c655fe` | Dashboard-confirmed deployment truth |
| **Git `main` (GitHub)** | `7c655fe` | Matches production |

### Rollback slices

| Slice | SHA | Scope |
|-------|-----|--------|
| A — Spine + identity | `da3c39c` | Login→profile, NEXUS nav/CTA, redirect safety |
| B — NEXUS ops | `205746b` | `operationalGames`, mode lanes, sort order |
| C — Battlefield | `34b48c5` | Lobby continuity, tournament rail, grace API, rating migration |
| D — Play Computer | `a12c17d` | Bot ensure script, provisioning detail, verification runners |
| E — Viewport | `9b80127` | Game shell CSS, grace banner on game page |

---

## Verification results (final — 2026-05-21)

**Operator environment:** local Windows, `.env.local` loaded, `NODE_TLS_REJECT_UNAUTHORIZED=0` (Node TLS workaround for corporate/proxy certs).

| Gate | Result | Evidence |
|------|--------|----------|
| Migration `20260519200000` (zero-move rating void) | **PASS** | Manual SQL applied in Supabase SQL Editor (`20260519200000_tournament_zero_move_rating_void.sql`) |
| `ensure:play-computer-bots` | **PASS** | All three bot profiles present; `auth_warnings=0` |
| Play Computer prod smoke (`accl-platform.vercel.app`) | **PASS** | balanced/aggressive/defensive/chaos → `source_type: bot_game`, HTTP 200 |
| 4-player KO verification | **PASS** | Registration → bracket → final → champion; cleanup OK |
| Concurrent overlap E2E (prod URL) | **PASS** | `PLAYWRIGHT_BASE_URL=https://accl-platform.vercel.app`, `--project=stage0-overlap` — blitz mode room, create/find pairing, concurrent navigation |
| Vercel production SHA | **PASS** | Production deployment = **`7c655fe`** (dashboard-confirmed) |

### Commands (re-run locally)

```powershell
cd c:\Users\Chees\accl-platform
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'

npm run ensure:play-computer-bots
$env:ACCL_BASE_URL='https://accl-platform.vercel.app'
node scripts/prod-play-computer-smoke.mjs

npm run verify:tournament-4p-ko

$env:PLAYWRIGHT_BASE_URL='https://accl-platform.vercel.app'
$env:PLAYWRIGHT_SKIP_WEBSERVER='1'
npx playwright test tests/functional/stage0-free-play-overlap-pressure.spec.ts --project=stage0-overlap
```

---

## Deployment truth

1. Vercel **Production** = **`7c655fe`**.
2. GitHub **`main`** = **`7c655fe`**.
3. Zero-move rating migration applied on production Supabase (manual SQL).
4. Deployment truth and GitHub `main` are aligned — no drift at freeze.

---

## Alpha tag

```text
alpha-stage0-20260521
Stage 0 operational alpha: spine, nexus ops, battlefield, sync play computer, viewport shell, overlap pressure
```

---

## Known limitations (Stage 0 scope)

- No Swiss, tournament bots, async bot queue authority changes, AI mentor, or reconnect sovereignty expansion.
- Management API migration check may still 401 if `SUPABASE_ACCESS_TOKEN` is stale; production migration was verified via manual SQL apply.
- Overlap test uses moderator + non-moderator when `E2E_USER_*` pair unset.
- Play Computer uses configured `BOT_USER_ID_*` (distinct UUIDs in this environment).

---

## Operational expectations (20 invited testers)

| Layer | Expectation |
|-------|-------------|
| **Profile** | Identity spine after login; public stats and history |
| **NEXUS** | Operational obligations only; populated mode lanes; your-move first |
| **Battlefield** | Tournament rail + first-move grace on live KO boards; zero-move finishes do not penalize ratings |
| **Free play** | Live open pairing, daily rooms, direct challenge via `/free/create` or `/free/play` |
| **Play Computer** | Sync start only; provisioning errors show `detail` text |
| **Observation phase** | Report navigation hesitation, overlap weirdness, trust breaks — not feature requests |

---

## Post-alpha: observation only

Do not expand Swiss, AI mentor, emotional runtime, graphics spirals, or new routes. Stage 0 success means the ecosystem is **observable under real overlap pressure**, not that more systems should be added.

---

## Stage 0 Patch 1 — board stability (`alpha-stage0-patch1-20260522` → `8936377`)

**Merged:** `fix/stage0-game-board-stability` → `main` (CSS + replay panel order + audit asserts).  
**Alpha freeze tag unchanged:** `alpha-stage0-20260521` → `7c655fe`.  
**DB finish hotfix:** applied manually outside Git (rating trigger); checkmate/timeout finish **PASS** on production.

### Post-patch visual smoke (2026-05-22)

| Check | Result |
|-------|--------|
| Normal move viewport drift (G1) | **PASS** — greatly improved / effectively gone |
| Drag ghost past rank 5 (G2) | **PASS** |
| Play Computer checkmate → Game Over | **PASS** |
| Post-game state load | **PASS** |

**Decision:** Patch 1 remains valid. Do not reopen G1/G2. Do not expand scope.

---

## Board observation backlog (post–Patch 1)

| ID | Severity | Status | Area | Observed | Expected | Action |
|----|----------|--------|------|----------|----------|--------|
| **G1** | P1/P2 | **Closed** | Viewport | Legal-move drift | Stable board on each ply | Fixed in Patch 1 |
| **G2** | P1/P2 | **Closed** | Drag | Ghost / offset past ~5th rank | Clean drag all ranks | Fixed in Patch 1 |
| **G3** | P2/P3 | Open | Illegal move UX | Piece returns + message OK; board/page **slightly jumps** on recovery | Reject with no visual shift | Defer — small recovery UX follow-up |
| **G4** | P2 | Open | Startup layout | Too much chrome above board (clocks, lobby/chat, metadata, controls, next-game banner); board **below fold** on desktop/split | Board-first; compact top; secondary controls lower/collapsed | Defer — do not fix without explicit approval |

**G3 notes:** Legality and clock OK. Likely client drag snap-back + `chessRef` re-render (`app/game/[id]/page.tsx`).

**G4 notes:** Layout/IA only — not move authority. Defer to post-observation board UX pass.
