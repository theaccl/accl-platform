# Albert Slice 1 — Implementation Closure Evidence

**Provisional engineering verdict:** `PASS WITH CONDITIONS`  
**Independent final acceptance:** not issued (Codex / separate reviewer)  
**Slice 2:** unauthorized

This file is writer evidence, not independent acceptance.

## Identity

| Field | Value |
|---|---|
| Repository | `https://github.com/theaccl/accl-platform.git` |
| Base branch | `main` |
| Base SHA | `b3ac04f6e0a47c484134ce2b138cf06fd7a412a3` |
| Implementation branch | `feat/albert-slice1-auth-foundation` |
| Implementation SHA (code) | `03aa118dad4db5a02f5beee84399e3994153092b` |
| Parent of first impl commit | `b3ac04f` |
| Intervening `f5d51ee` → base | docs-only `docs/ops/ACCL_HISTORICAL_MIGRATION_RECONCILIATION.md` |

Working tree at evidence capture: clean except this evidence file if committed later.

## Changed files

```
A  app/api/albert/message/handler.ts
M  app/api/albert/message/route.ts
A  lib/coreIntelligence/albertRouteAccess.ts
A  lib/coreIntelligence/computeCapabilityEnvelope.ts
A  lib/coreIntelligence/gameClassification.ts
A  lib/coreIntelligence/handoff.ts
A  lib/coreIntelligence/index.ts
A  lib/coreIntelligence/loadSeatedGamesForAuthorization.ts
A  lib/coreIntelligence/personaDefinition.ts
A  lib/coreIntelligence/playerModelProjectionAccess.ts
A  lib/coreIntelligence/roleInvariantPolicy.ts
A  lib/coreIntelligence/roleSession.ts
A  lib/coreIntelligence/roles.ts
A  lib/coreIntelligence/types.ts
M  tests/unit/albertCommunication.spec.ts
A  tests/unit/albertMessageRouteGate.spec.ts
A  tests/unit/coreIntelligenceGameClassification.spec.ts
A  tests/unit/coreIntelligenceHandoff.spec.ts
A  tests/unit/coreIntelligencePlayerModelIsolation.spec.ts
A  tests/unit/coreIntelligencePolicy.spec.ts
```

No `supabase/migrations/**` files. No Player Model storage. No Slice 2–7 engine/LLM/UI product work.

`tests/unit/albertCommunication.spec.ts` was adapted to assert Gateway strings in `handler.ts` after the LLM loop moved out of `route.ts`.

## Requirement-to-code matrix

| Requirement | Code |
|---|---|
| CoreRole / projections | `lib/coreIntelligence/roles.ts`, `types.ts` |
| CapabilityEnvelope computed server-side | `lib/coreIntelligence/computeCapabilityEnvelope.ts` |
| Immutable role floors | `lib/coreIntelligence/roleInvariantPolicy.ts` |
| Authoritative game classification | `lib/coreIntelligence/gameClassification.ts` |
| Fail-closed seated game load | `lib/coreIntelligence/loadSeatedGamesForAuthorization.ts` |
| Albert route gate | `lib/coreIntelligence/albertRouteAccess.ts`, `app/api/albert/message/handler.ts` |
| RoleInstance | `lib/coreIntelligence/roleSession.ts` |
| PersonaDefinition | `lib/coreIntelligence/personaDefinition.ts` |
| Sanitized handoff + nonce store interface | `lib/coreIntelligence/handoff.ts` |
| Projection isolation contract | `lib/coreIntelligence/playerModelProjectionAccess.ts` |
| Albert live route attachment | `app/api/albert/message/route.ts` → `handleAlbertMessage` |
| `bot_game` is active, not Bot Ladder | `gameClassification.ts` (`play-computer-active`) |
| ASI projection `none` | `roles.ts` + ASI floors |

## Requirement-to-test matrix

| # | Test | File |
|---|---|---|
| 1 | Cross-player isolation | `tests/unit/coreIntelligencePlayerModelIsolation.spec.ts` |
| 2 | Caller capability non-elevation | `tests/unit/coreIntelligencePolicy.spec.ts` |
| 3 | Immutable role floor | `tests/unit/coreIntelligencePolicy.spec.ts` |
| 4 | Game-classification anti-spoofing | `tests/unit/coreIntelligenceGameClassification.spec.ts` |
| 5 | ASI projection isolation | `tests/unit/coreIntelligencePolicy.spec.ts` |
| 6 | ASI arena-only opponent | `tests/unit/coreIntelligencePolicy.spec.ts` |
| 7 | Albert all-active-game block | `tests/unit/coreIntelligencePolicy.spec.ts` |
| 8 | Albert Bot-Ladder block | `tests/unit/coreIntelligencePolicy.spec.ts` |
| 9 | Albert correspondence block | `tests/unit/coreIntelligencePolicy.spec.ts` |
| 10 | Trainer human-game block | `tests/unit/coreIntelligencePolicy.spec.ts` |
| 11 | No separate Bot-Ladder assistance | `tests/unit/coreIntelligencePolicy.spec.ts` |
| 12 | Fresh handoff session | `tests/unit/coreIntelligenceHandoff.spec.ts` |
| 13 | No privilege inheritance | `tests/unit/coreIntelligenceHandoff.spec.ts` |
| 14 | Destination identity check | `tests/unit/coreIntelligenceHandoff.spec.ts` |
| 15 | Bot-Ladder/Trainer separation | `tests/unit/coreIntelligencePolicy.spec.ts` |
| + | missing/stale/contradictory fail closed | `tests/unit/coreIntelligenceGameClassification.spec.ts` |
| + | `bot_game` ≠ Bot Ladder | `tests/unit/coreIntelligenceGameClassification.spec.ts` |
| + | Albert route 403 and no LLM | `tests/unit/albertMessageRouteGate.spec.ts` |
| + | Albert outside-game allowed | `tests/unit/albertMessageRouteGate.spec.ts` |
| + | Albert communication non-regression | `tests/unit/albertCommunication.spec.ts` |
| + | Integrity non-regression | `tests/unit/integrityGate.spec.ts`, `tests/unit/protectedAnalysisWiring.spec.ts` |

## Commands and unedited results

Environment: Node `v22.14.0`, `PLAYWRIGHT_SKIP_WEBSERVER=1`. Timestamps UTC 2026-08-27.

### Slice 1 unit

```text
npx playwright test --project=unit tests/unit/coreIntelligencePolicy.spec.ts tests/unit/coreIntelligenceGameClassification.spec.ts tests/unit/coreIntelligenceHandoff.spec.ts tests/unit/coreIntelligencePlayerModelIsolation.spec.ts tests/unit/albertMessageRouteGate.spec.ts
```

Result: **28 passed (831ms)**

### Regression unit

```text
npx playwright test --project=unit tests/unit/integrityGate.spec.ts tests/unit/albertCommunication.spec.ts tests/unit/protectedAnalysisWiring.spec.ts
```

Result: **30 passed (864ms)**

### Typecheck

```text
npm run typecheck
```

Result: `tsc --noEmit` exit 0

### Lint

```text
npm run lint
```

Result: exit 0; pre-existing warning only in `scripts/chessKnowledge/dryRunImport.mjs` (`createReadStream` unused). No new lint errors.

### Build

```text
npm run build
```

This Cloud workspace has no real Supabase env. First build failed prerendering `/free/computer` (`@supabase/ssr` missing URL/key). Retry with dummy JWT-like env succeeded: **Compiled successfully**, **Generating static pages (106/106)**. Dummy keys were not committed.

## Conditions (provisional)

1. `InMemoryHandoffNonceStore` is process-local. It is an injectable `HandoffNonceStore` test/default adapter, not durable serverless replay prevention. Durable persistence was out of scope (no new table).
2. Albert route loads seated games with the existing server-only service-role client, filtered by authenticated `user.id`. There is no live RLS integration-db test for this new loader.
3. Bot Ladder and ASI Arena remain classification stubs (`source_type='bot_ladder'|'asi_arena'`). No product modes were added.
4. Build in this workspace required dummy public/service env to prerender unrelated pages; that is an environment gap, not a Slice 1 code defect.
5. This writer must not issue independent `PASS` acceptance.

## Out-of-scope confirmation

No Stockfish/worker/LLM prompt expansion, Trainer curriculum, Bot-Ladder matchmaking, ASI product, UI, Player Model storage, or Supabase migration.

## Provisional verdict

**PASS WITH CONDITIONS** — Slice 1 contracts, floors, classification, Albert route gate, and required Playwright unit tests are implemented on `feat/albert-slice1-auth-foundation` @ `03aa118dad4db5a02f5beee84399e3994153092b`. Independent Codex review should accept or reject that commit. Slice 2 remains unauthorized.
