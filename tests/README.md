# ACCL Playwright tests

Prerequisites:

1. App running locally (for example `npm run dev`) or set `PLAYWRIGHT_BASE_URL` to a deployed origin.
2. For authenticated smoke tests: `E2E_USER_EMAIL` and `E2E_USER_PASSWORD` (Supabase users).
3. For **two-user** tests in `functional/` and some `regression/` specs: also set `E2E_USER_B_EMAIL` and `E2E_USER_B_PASSWORD`. User B must have a `profiles` row whose **`email`** matches (challenge lookup uses `profiles.email`).
4. For moderator dashboard auth-state coverage:
   - `E2E_MODERATOR_EMAIL` + `E2E_MODERATOR_PASSWORD` (must have moderator/admin role).
   - `E2E_NON_MODERATOR_EMAIL` + `E2E_NON_MODERATOR_PASSWORD` (authenticated but not moderator).
   - `E2E_SUPABASE_SERVICE_ROLE_KEY` + `E2E_SUPABASE_URL` (required) for deterministic moderator queue + linked anti-cheat seed/read/cleanup.
   - Safety guard: remote DB seeding is blocked unless `E2E_ALLOW_REMOTE_DB_SEED=true` is set for a dedicated non-production target.

Commands:

- `npm run test:e2e` — headless run (starts `npm run dev` on `PLAYWRIGHT_BASE_URL` unless you set `PLAYWRIGHT_SKIP_WEBSERVER=1`)  
- `npm run test:e2e:ui` — Playwright UI  
- First-time browsers: `npx playwright install`  
- If port 3000 is busy: set `PLAYWRIGHT_DEV_PORT=3001` (Playwright starts `next dev -p 3001` and uses matching `baseURL`). Or attach to an existing server with `PLAYWRIGHT_SKIP_WEBSERVER=1` and `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000`. Optional `PLAYWRIGHT_REUSE_SERVER=1` reuses the URL without starting a new process (may be stale).

Moderator smoke specs are fail-fast (no credential skips): missing env or incorrect moderator/non-moderator roles now fail setup with an actionable error.

Playwright now prepares auth-state files in `tests/setup/auth.setup.ts` before browser projects run. The moderator route specs use dedicated fixtures:
- `moderatorTest` (moderator storage state)
- `nonModeratorTest` (non-moderator storage state)
- `unauthenticatedTest` (empty storage state)

Multiplayer specs use `test.describe.configure({ mode: 'serial' })` to reduce DB cross-talk; CI should keep `workers: 1` for stability. See `docs/ACCL-RUNTIME-AUDIT-AND-TEST-PLAN.md` (Phase 2–5). Phase 3–4: **launch convergence** (challenger realtime redirect), **startup normalization** (`startup-normalization.spec.ts`), **resign / finished lock** (`end-state-resign.spec.ts`). Phase 5: **draw offer/accept/decline** (`draw-agreement.spec.ts`, `draw-decline.spec.ts`). Phase 6: draw accept uses **`finish_game`** RPC (same as resign); shared finished UI assertions in `tests/helpers/finishedGameUi.ts`; DB reality checks → `supabase/MANUAL_VERIFICATION_PACK.sql`. Phase 7: **`terminal-finish-checkmate.spec.ts`** (fool’s mate → `persistMove` path); **`data-result`** parity + `expectFinishedParitySummary`; live DB steps → `supabase/OPERATOR_RUNBOOK.md`. Phase 8: **docs-only closure** — backend parity decision & trust matrix in `docs/ACCL-RUNTIME-AUDIT-AND-TEST-PLAN.md` §61+; live SQL outputs still must be pasted to unblock verification. Phase 9: **terminal finishes** call **`finish_game`** after move patch in `app/game/[id]/page.tsx` (`persistMove`); requires DB `finish_game` to accept terminal `p_end_reason` values (see audit §76). Direct challenge needs **Realtime** on `match_requests` in Supabase.

Controlled extraction references:

- `docs/MANUS_CONTROLLED_EXTRACTION.md` — integration guardrails for Manus-derived structure.
- `tests/ARCHITECTURE_VALIDATION_MAP.md` — invariant-to-test mapping used during review/alignment passes.
