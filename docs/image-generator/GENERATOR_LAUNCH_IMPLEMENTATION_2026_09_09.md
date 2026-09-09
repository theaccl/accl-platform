# Generator launch implementation — local evidence

September 9, 2026. This records local implementation, not deployment or production readiness. The owner-approved launch policy supersedes the earlier contracts.

## Delivered locally

- Separate Generation, Guidance and Compare square wallet cards with persistent server balances. Purchased tokens are shown as a subset of available tokens, never added twice. Missing/error balances remain unavailable. Guidance and Compare actions remain disabled pending their prices and allowance schedules.
- Existing supported style directions are free selections. Only the explicit Generate button submits. Optional creation, refinement and saved-evolution prompts share a 50-whitespace-separated-word rule, a 2,000-character input ceiling and trusted empty defaults. Server-composed styles have separate database headroom. Typing Enter and changing styles never generates.
- Creation retries keep the same idempotency key and uploaded reference IDs after an uncertain response; inputs remain locked until that attempt resolves. Tab-scoped session storage preserves the exact attempt across reloads, keyed by authenticated account, without auth tokens or image bytes. Recovery still requires Generate; reload does not submit. Confirmed responses move recovery to the generation URL and clear the pending attempt. Saved evolution and included refinements reuse keys for identical in-page retries; their unacknowledged retries are not yet persisted across a full reload.
- Source-aware Generation accounting mirrors the existing ledger in the same transaction. Recurring, signup, earned reward, replacement, purchased and legacy sources remain distinguishable. Guidance/Compare service-only credits have separate ledgers, with no browser mint or purchase endpoint.
- Free receives two distinct one-time grants without generating. Standard gets 2/month, Plus 2/week, Pro 4/week. Recurring balances cap at 4/4/8; recurring reservations occupy capacity until spent/refunded. Purchased/reward/replacement/legacy sources stay outside that cap. Old balances are preserved as legacy because their origin cannot safely be inferred.
- UTC calendar periods accrue once. Same-cadence upgrades receive only the period target difference; cadence changes use distinct monthly/weekly periods. Downgrades preserve held balances and reduce future issuance. At-cap periods are recorded so spending does not trigger a second grant. The production worker schedule processes allowances; Preview has no automatic cron. Current-period catch-up happens on entitlement reads and creation, but missed historical periods are not reconstructed after scheduler downtime.
- Standard/Plus/Pro opening candidates are 1/2/3; keep limits 1/2/2. Free keeps its 3/1 contract, internal Unlimited its five opening candidates and no token spend, with keep-two. Each new commission stores `launch.2026-09-09` and its keep limit. Historical rows keep their legacy single-retention contract.
- Retained selections are atomic, unique and final; identical replay succeeds and conflicting replay fails. Both retained candidates enter saved lineage. Pro placement produces a 512-square still profile derivative and a 1600-by-900 still background without another commission charge. Rejected and stranger-owned candidates cannot be placed.
- Existing motion boundaries are preserved: acceptance stops candidate presentation; owner-only Plus motion, still community listings and reduced-motion precedence remain enforced.
- Billing webhook recognition accepts only unambiguous configured Standard/Plus/Pro price IDs. The new database sync preserves event ordering and rejects subscription ownership reassignment. This does not create Stripe products/prices or add Standard/Plus checkout screens; the existing controlled Pro checkout remains.
- Battlefield free-join and paid-entry paths check Standard-or-above membership. A database trigger also prevents new entries through alternate insertion paths. Existing entries/recovery remain valid. Generator-only Unlimited access does not grant Battlefield access.
- Moderator page authentication now uses the application's existing Supabase SSR session reader, including base64/chunked cookies, and validates the user before checking the moderator role. Authenticated hosted moderator access remains to be tested.

## Zero-cost evidence

- 159 affected Playwright unit/browser scenarios passed, including the real fixture worker test with `PGLITE_MODULE` enabled (not skipped), prompt boundaries, motion, multi-keep UI, issue AI/manual policy, paid-entry denial before provider work and existing email-verification gates. The final reload-recovery change adds one storage-isolation test and rechecks eight acceptance scenarios.
- `tests/generator-launch-ledger.mjs` passed against real migrations in isolated PostgreSQL WASM: signup, period idempotency, cap, purchased protection, source-key conflicts, reservation/refund replay, separate wallets, keep-two, saved lineage, billing tier changes/stale events, Battlefield denial/recovery and client privilege denial.
- The real worker test generated synthetic PNG bytes, ran guided refinement, accepted two candidates and executed Pro placement using real SQL and crop bytes. Storage was an isolated in-memory adapter. Outbound fetch was forbidden; provider receipts totalled zero.
- Standalone mocked desktop/mobile wallet checks passed: square cards, no page overflow, unavailable/zero/Unlimited balances, no charge from selection/typing, explicit submission and authoritative refresh. A lost response resulted in two same-key attempts and one commission. Screenshots are synthetic, not real account balances.
- Typecheck, full lint and production build passed using dummy local backend settings. Lint retains one pre-existing unused-import warning in `scripts/chessKnowledge/dryRunImport.mjs`. Missing live credentials in the build are intentional.

Run from the repository, using the existing separate PGlite runtime and a local dev server with dummy settings:

```powershell
$env:PGLITE_MODULE='<absolute path to @electric-sql/pglite/dist/index.js>'
node tests/generator-launch-ledger.mjs
$env:PLAYWRIGHT_SKIP_WEBSERVER='1'
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3148'
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321'
node node_modules/@playwright/test/cli.js test --project=unit 'imageGenerator|generationTokens|membershipPlans|proBillingEntitlement|battlefieldMembership|emailVerificationPhaseB2' --workers=2
```

## Remaining launch gates

1. Approve the exact four migrations and local commits for the identified disposable staging database and scoped Preview. No remote changes were made in this continuation.
2. Verify real Auth sessions, private Storage denial, moderator login, reference upload, two-account access and multi-session races in staging. PGlite is single-session evidence; browser mocks do not establish these permissions.
3. Define Guidance/Compare prices and recurring grants before implementing their spending actions. Purchased-source protection exists; token purchase checkout/fulfillment is not implemented.
4. Finish Standard/Plus checkout configuration and test actual provider subscription events in test mode. Review paid Battlefield intent expiry: a membership that expires between checkout and webhook can deny entry after payment; automatic refund/recovery for this new condition is not yet implemented. Keep paid-entry testing mocked until this is closed.
5. Extend tab recovery to saved evolution and included refinements, and verify scheduler operation/outage handling before promising unattended periodic accrual. Opening commission reload recovery is covered locally.
6. Validate real image provider quality/integration only when needed and after verifying free-credit eligibility, remaining balance and a prospective worst-case spend bound. This continuation spent $0; no live quality or AI-review integration evidence was obtained. Existing retrospective controls are not a hard distributed daily budget.

The fixture lane safely reuses existing hosting with scoped requests and the disposable database. No service was cancelled, no paid resource was created, and no existing staging record was removed. Production is excluded.
