# Generator issue reports and token replacements

Local implementation; not deployed. No live AI assessment or remote database mutation was performed.

## Product behavior

Players can report a commission after processing begins, choose manual or AI review, and revisit the report from the commission link. The report form explains private review access and AI-provider evidence sharing. Reporting itself does not restore a token. A confirmed issue replaces the eligible spent token once. Original spending history remains recorded. Prior refunds and zero-cost Unlimited commissions receive no additional token.

AI can approve directly, as authorized by the owner. Every uncertain, negative, incomplete, unavailable, or failed AI review goes to a manual decision. The initial automatic approval policy covers clearly supported technical defects or objectively unusable commissions. Broader qualification criteria remain a product decision; other issue types can be submitted for manual review.

The moderator dashboard links to `/moderator/generator-issues`. It lists the oldest 50 pending reports, opens the original prompt, refinement guidance, short-lived private candidate previews, and AI handoff notes. Decisions require a player-visible reason. Player APIs authenticate the owner; moderator APIs use the existing trusted moderator-role guard. Reports and decisions have no browser database grants.

## Atomic accounting and review

New local migration: `20260908190222_image_generation_issue_reviews.sql` (created using the installed Supabase CLI).

One report per commission gives request retries a stable identity. Each report can claim one AI attempt. Final decisions are immutable through the review API. AI claims expire after 60 seconds; an owner status request hands abandoned work to the manual queue, which can already see all pending reports. A late AI response cannot override manual handoff or a completed decision.

Approval locks the request, report, redemption, then account, matching existing commission lock order. It uses the existing restitution operation and source key, labeling the new entry `generator_issue_replacement` inside the same transaction. This prevents duplicate credit from repeated decisions or automatic failure recovery. The original spend entry and lifetime-spent total remain unchanged; the redemption's internal restitution state becomes `refunded`. The replacement is not counted as an earned allowance. Report approval and token accounting commit or roll back together.

## AI controls

`ACCL_IMAGE_ISSUE_AI_REVIEW_ENABLED=true` and a nonempty `ACCL_IMAGE_ISSUE_REVIEW_MODEL` are both required. Neither was configured during this work. There is deliberately no default model. An operator must approve and verify a compatible vision model and provider budget before enabling it. Without configuration, choosing AI routes to manual review.

One structured AI call per report, no provider retries, 20-second model timeout, and at most 13 candidate previews resized to 768 pixels. Original prompts and images are untrusted evidence, never instructions. The model receives no tools or balance access. Server validation gates the decision; assessment, policy version, model, usage, timestamps, and manual reviewer identity are retained privately.

## Local validation and remaining staging checks

The PostgreSQL WASM probe executes the actual migration and existing token transition function against an isolated schema fixture. It covers owner denial, no credit on submission, original spend preservation, approval replay, automatic refund before/after approval, Unlimited, manual rejection, AI claim replay, handoff, expired claims, and browser privilege denial. This is not a substitute for multi-session concurrency tests or Supabase advisor checks against the integrated staging schema. Docker's database engine was unavailable locally.

Unit tests cover assessment validation and forged report fields. Browser tests use synthetic accounts, mocked commission APIs, and local fixture images. They cover lost report responses, safe retry, manual/AI handoff states, reload recovery, replacement display, signed-out API denial, and existing acceptance/placement/motion flows. No real accounts, private images, or provider balances are used.

Results: 119 generator/token unit tests passed; six existing browser checks and three new issue-report browser checks passed. The database probe passed, as did TypeScript and focused lint. A browser check found and verified a fix for ambiguous select labels. Approval refreshes the displayed Vault balance from the server. The production build was checked using process-scoped synthetic local configuration.

Remaining limits: manual reference/evolution context is flagged but not displayed; AI routes those commissions to manual review. Existing private-original expiry and cleanup still apply, so unavailable evidence cannot justify automatic approval. There is no appeal/reopen flow or email notification in this slice. Production-quality evidence retention, full moderator authenticated browser validation, integrated schema advisors, and simultaneous manual/AI/refund transactions remain staging work.

## Next five steps

1. Complete local reporting UI, moderator queue, and reviewed replacement logic.
2. Validate AI approval/handoff, retry safety, accounting, and access denial locally.
3. Run regression checks and make a focused local commit.
4. Obtain one bounded staging approval identifying exact pending migrations, approved AI/provider models, existing-free-credit caps, disposable data, and cleanup scope. Push approval remains separate unless explicitly combined by the owner.
5. Apply only approved staging changes, run accept/place and issue-review scenarios, verify cross-account denial and balance history, then remove only the exact disposable records/assets and restore temporary settings.

The prior staging plan covered two recovery migrations. This feature adds a third pending migration and a separate optional AI-review provider call. Neither is covered by any previous approval.
