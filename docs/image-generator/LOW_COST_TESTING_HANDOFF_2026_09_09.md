# ACCL Image Generator — low-cost testing handoff

Owner direction, September 9, 2026. The current membership source is [the first-launch policy](GENERATOR_LAUNCH_POLICY_2026_09_09.md); its capped rollover is included at launch.

## Inspect and preserve first

Inspect the active branch/environment, configured image provider, recurring services, generation triggers and billing, stored test images, entitlement/counter logic and valuable prompts/UI/storage/moderation/configuration. Classify assets as KEEP, ARCHIVE, REBUILDABLE or DISPOSABLE. Do not cancel or delete resources before inspection, preservation and dependency checks are complete. Inspection alone is not deletion authorization.

The September 9 inspection found the Generator on `feature/image-generator-slice-1` in the existing ACCL Vercel project. Preview uses the disposable Supabase project `qquttuyopiqxfwzceitc`. The current image adapter uses Vercel AI Gateway with `openai/gpt-image-2`. No real-provider test was run. That database contains no generation requests or reusable generated images; its only two candidate-bucket objects are zero-byte folder placeholders. Existing profiles and unrelated staging data remain protected. The user's repository `outputs/` remains excluded from inspection.

The private account-cost report and staging execution record are saved in the originating task's output folder. Keep billing details out of public product UI.

## Lane A — functional tests

Use mocks or stored test images for uploads, crops, generation/regeneration buttons, entitlement counting, token deductions, tier restrictions, keep/discard, storage, profile images, backgrounds, history, errors, queues, mobile layout, moderation workflows and capped rollover. A prior generated image can stand in for a new generation. Never buy another image merely to prove a button works.

Local tests already inject fake image-provider calls, render synthetic PNGs, intercept browser APIs and exercise a PostgreSQL WASM ledger probe. Extend these rather than discard them. Browser mocks alone do not prove backend permissions or concurrent balances: exercise the real worker, database and storage with fixture bytes in an isolated local database or the verified shared staging environment.

A server fixture adapter is still needed for a complete hosted functional lane. Keep normal validation, token transitions, private access and placement checks. Replace only the external provider with fixture bytes. Label every request's mode and test scope, require its worker to claim only that mode/scope, and assert zero model-provider calls. Model errors, AI approval and uncertainty can be deterministic fixture cases.

Use fake clocks and test billing events for signup, monthly/weekly allowances, caps, upgrades and downgrades. Do not create real subscriptions to test counters. A hosted fixture run may consume hosting/storage resources even though model-provider cost is zero.

## Lane B — actual provider and quality evidence

Use the minimum real generations needed for prompt quality, ACCL likeness, visual quality, genuine tier-quality differences, reference transformation, consistency, provider moderation and actual API behavior. An AI-review integration check can reuse existing synthetic images; it does not require a new image-generation call.

Preserve successful examples privately with their original prompt, style/model/policy version, dimensions, checksum, provenance, expected result and cost receipt. Do not label a stochastic image as rebuildable merely because its prompt is saved. Do not copy private production user images into a public fixture library.

## Shared platform

Prefer the existing ACCL Vercel project and one verified non-production testing database. A Git branch does not isolate queues, data, credentials or storage. Separate fixture/live worker claims and provider authorization while sharing hosting where practical. Avoid a dedicated always-on image generation testing service.

The current Preview shares ACCL hosting already. Its database runs paid Micro compute. Preserve it until its other dependencies and assets are accounted for; do not create another paid staging database by default. No distinct canonical shared testing Git branch was verified during this inspection, so do not guess a merge target.

## Spending protection

- Default functional tests to fixture mode, with outbound provider calls blocked and test assertions that the call count is zero.
- Default live work to disabled outside an explicit bounded test window; server-allowlist model, environment and test accounts.
- Removing an API key alone is insufficient on Vercel: deployment OIDC can authorize Gateway requests.
- Reserve worst-case spend atomically before dispatch across generations, refinements, reviews, retries and concurrent callers. Unknown billed outcomes retain their reservation until reconciled.
- Add distributed call limits, daily test ceilings, one-worker live smoke runs, durable idempotency, a kill switch, usage alerts and receipts. Provider budgets supplement application limits; they do not replace them.
- Use development-scoped credentials or appropriately scoped OIDC. Do not borrow paid production keys. Leave automatic recharge off.
- Run local checks before approved pushes; repeated cloud builds can cost more than fixture testing.

Current per-commission controls examine already recorded spend; they are not a hard prospective or daily cap. The image SDK has two retries and the queue permits three attempts. AI-review calls require their own shared-budget accounting. Process-local request throttling does not bound distributed spend.

The existing live test approval remains at most $0.05 total existing free credit, conditional on exact model access, cost bounds and isolation. It does not authorize recurring spend, purchases, automatic recharge, new provider keys or model substitution. No real calls were made under it during the September 9 inspection.

## Preservation classification

KEEP: ACCL prompt/style versions, UI/motion, storage/access control, derivatives, moderation/reviews, token ledger/recovery/idempotency, migrations, tests, brand marks, valid originals, existing secrets in their stores and unrelated staging data.

ARCHIVE: superseded doctrine, useful historical handoffs and test/deployment evidence. Preserve future successful real examples for reuse in a controlled private fixture library.

REBUILDABLE: geometric fixtures, local test state, build output and derivatives whose original and recipe survive.

DISPOSABLE: only exact manifested test accounts/records/assets once inspection and authorized cleanup permit removal. Existing empty folder markers offer no meaningful storage savings and are not this run's fixtures.

## Required inspection report

Report current architecture, current costs and attribution limits, avoidable costs, real-provider-only tests, fixture tests, shared-platform safety conditions, preserved assets and the cheapest recommended approach. Separate observed deployed behavior from newly approved product policy and unimplemented recommendations. Never count a mock response as successful real-provider validation.
