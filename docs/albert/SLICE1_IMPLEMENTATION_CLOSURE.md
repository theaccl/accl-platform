# Albert Slice 1 — Implementation Closure Evidence (Codex re-review)

**Provisional engineering verdict:** `PASS WITH CONDITIONS`  
**Independent final acceptance:** not issued (Codex / separate reviewer)  
**Prior independent verdict:** `FAIL — CHANGES REQUIRED` (PR #42 @ `7c6f02c`)  
**Slice 2:** unauthorized

This file is writer evidence, not independent acceptance.

## Identity

| Field | Value |
|---|---|
| Repository | `https://github.com/theaccl/accl-platform.git` |
| PR | `#42` |
| Base branch | `main` |
| Base SHA | `b3ac04f6e0a47c484134ce2b138cf06fd7a412a3` |
| Implementation branch | `feat/albert-slice1-auth-foundation` |
| Corrective code SHA | 9c6d651bbe1d8bea7ce72e357d18e35714260b28 |

## Codex findings addressed

1. ASI packets strip `lessonOrTaskContext`, `permittedPlayerModelRefs`, and `completedGameOrTrainingIds` at create and again at transition.
2. Replay uses atomic `consumeOnce(nonce)`; split `hasConsumed`/`consume` removed.
3. Packets bind `sourceRole` and `sourceRoleSessionId`; both are validated against the presented source session.
4. Destination role/persona must match server-owned authorization (`AUTHORIZED_ROLE_TRANSITIONS` + catalog persona match). Packet destination is not self-authorizing.
5. Future timestamps, malformed `issuedAt`, empty nonces, and non-positive `maxAgeMs` are rejected.
6. Direct production-loader tests cover query columns, `active`/`waiting`, both seat filters, authenticated id, fail-closed errors, and no caller `gameType`.

## Changed files vs `main`

```
A  app/api/albert/message/handler.ts
M  app/api/albert/message/route.ts
A  docs/albert/SLICE1_IMPLEMENTATION_CLOSURE.md
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
A  lib/coreIntelligence/roleTransitionPolicy.ts
A  lib/coreIntelligence/roles.ts
A  lib/coreIntelligence/types.ts
M  tests/unit/albertCommunication.spec.ts
A  tests/unit/albertMessageRouteGate.spec.ts
A  tests/unit/coreIntelligenceGameClassification.spec.ts
A  tests/unit/coreIntelligenceHandoff.spec.ts
A  tests/unit/coreIntelligencePlayerModelIsolation.spec.ts
A  tests/unit/coreIntelligencePolicy.spec.ts
A  tests/unit/loadSeatedGamesForAuthorization.spec.ts
```

No `supabase/migrations/**`. No Player Model storage. No Slice 2–7 product work.

## Requirement-to-test (Codex re-review)

| Finding | Test |
|---|---|
| ASI packet sanitization | `tests/unit/coreIntelligenceHandoff.spec.ts` — ASI packets cannot carry coaching context |
| Atomic consume-once | same file — concurrent transitions |
| Source session binding | same file — packet bound to originating role session |
| Server destination authorization | same file — destination role/persona must be server-authorized |
| Future/malformed/empty nonce | same file — future, malformed, empty-nonce, invalid age |
| Production loader | `tests/unit/loadSeatedGamesForAuthorization.spec.ts` |

Original 15 policy tests remain in the Slice 1 unit files.

## Commands and unedited results

Environment: Node `v22.14.0`, `PLAYWRIGHT_SKIP_WEBSERVER=1`. UTC 2026-08-28.

### Slice 1 unit (including adversarial + loader)

```text
npx playwright test --project=unit tests/unit/coreIntelligencePolicy.spec.ts tests/unit/coreIntelligenceGameClassification.spec.ts tests/unit/coreIntelligenceHandoff.spec.ts tests/unit/coreIntelligencePlayerModelIsolation.spec.ts tests/unit/albertMessageRouteGate.spec.ts tests/unit/loadSeatedGamesForAuthorization.spec.ts
```

Result: **36 passed (760ms)**

### Albert/integrity regression

```text
npx playwright test --project=unit tests/unit/integrityGate.spec.ts tests/unit/albertCommunication.spec.ts tests/unit/protectedAnalysisWiring.spec.ts
```

Result: **30 passed (584ms)**

### Typecheck

```text
npm run typecheck
```

Result: `tsc --noEmit` exit 0

### Lint

```text
npm run lint
```

Result: exit 0; pre-existing warning only in `scripts/chessKnowledge/dryRunImport.mjs`.

### Build

```text
npm run build
```

Result: **Compiled successfully**, **Generating static pages (106/106)**, using non-secret placeholder Supabase values in this Cloud workspace.

## Remaining conditions

1. `InMemoryHandoffNonceStore.consumeOnce` is atomic **within one process**. It is still not durable across serverless isolates. No new table was authorized.
2. Loader tests use a query-builder mock of the production function. There is still no live database integration-db test for this path.
3. This writer does not issue independent acceptance.

## Provisional verdict

**PASS WITH CONDITIONS** after applying the Codex `FAIL — CHANGES REQUIRED` specification. Slice 2 remains unauthorized.
