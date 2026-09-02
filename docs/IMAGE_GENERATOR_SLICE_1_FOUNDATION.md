# Image Generator Slice 1 foundation

This branch implements the Generation Token economy, Free/Plus/Pro/Internal Unlimited contracts, private candidate workflow, guided refinements, saved-creation lineage, placement derivatives, audience-aware motion policy, and the React Bits candidate presentation layer.

The owner-approved source of truth is [`docs/image-generator/ACCL_GENERATION_TOKEN_AND_MEMBERSHIP_DOCTRINE.md`](image-generator/ACCL_GENERATION_TOKEN_AND_MEMBERSHIP_DOCTRINE.md). This foundation document describes the implemented runtime and must not be used to re-open settled membership rules.

## Implemented product behavior

- A Generation Token commissions one opening generation. Internal Unlimited commissions are still written to the audit ledger at zero displayed cost.
- Exact commission, guided-refinement, and saved-creation retries return their original server record before rechecking mutable tier, reference, candidate, or review state. A changed payload under the same idempotency key is rejected, so retries cannot duplicate token reservations or provider work.
- Free receives 3 opening candidates, Plus receives 4, and Pro/Internal Unlimited receive 5.
- Free and Plus accept one private reference and place either an icon or background. Pro/Internal Unlimited accept two references and may place a matching icon/background set. The matching-set API rejects lower-tier commission contracts before downloading the private candidate or computing derivatives, while the atomic database placement function remains the final enforcement boundary.
- Plus receives one guided touch-up producing 2 more candidates. Pro/Internal Unlimited receive up to four guided refinements producing 2 candidates each.
- Candidate review lasts 24 hours.
- The review boundary fails closed at the API deadline: expired review candidates cannot receive new signed URLs, queued refinements cannot start after expiry, and the trusted maintenance pass persists expired request/candidate state without deleting private objects before a retention policy is approved.
- Exactly one candidate may be approved. The approval transaction rejects the remaining candidates.
- Accepted candidates remain private saved creations with immutable parent/root lineage. Pro/Internal Unlimited may spend a new commission token to further a saved creation.
- Placement publishes a still derivative. Candidate originals remain in the private bucket.
- Motion visibility is resolved server-side by membership, surface, and viewer audience. Reduced-motion preferences always receive the still fallback.
- Weekly Plus/Pro minting and Pro anniversary minting are server-authoritative, idempotent, and replacement-based. Anniversary timing comes from the provider subscription start, not a browser-supplied date.
- Gateway provider cost and placement-derivative work are recorded against the owning commission. Single-surface placement records one derivative receipt; Pro/Internal Unlimited matching-set placement records both coordinated derivatives under one run and fails before publication if either receipt cannot be secured. Server-only controls can stop generation, cap attempts, and enforce a per-commission provider-cost ceiling.
- Token minting, stale-job recovery/refunds, reference cleanup, and review-expiry maintenance run even when the image-generation provider is unavailable; only new provider work is blocked by missing provider configuration.

## Server configuration

Required for API authentication and storage:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Required for the trusted worker:

- `ACCL_IMAGE_GENERATION_QUEUE_SECRET` (minimum 16 characters). The existing `ACCL_ANALYSIS_QUEUE_SECRET` is a supported fallback.
- Vercel deployments use their automatically provided OIDC token to authenticate to Vercel AI Gateway.
- Local or non-Vercel workers use `AI_GATEWAY_API_KEY` as a server-only fallback.
- `ACCL_IMAGE_GENERATION_MODEL` is optional and defaults to `openai/gpt-image-2`.

Required for staged Pro billing:

- `STRIPE_SECRET_KEY` must be a Stripe test-mode key (`sk_test_…`) during controlled launch.
- `STRIPE_WEBHOOK_SECRET` verifies the raw Stripe webhook body.
- `STRIPE_PRO_PRICE_ID` identifies the recurring Pro price; unrelated subscriptions cannot grant access.
- `NEXT_PUBLIC_APP_URL` supplies trusted Checkout success and cancellation origins.

`POST /api/payments/pro/checkout` creates an authenticated subscription Checkout. Stripe subscription webhooks synchronously upsert the billing record and the `image_generator` entitlement in one database transaction. Active, trialing, and not-yet-expired past-due subscriptions retain access. Cancellation, unpaid/paused/expired states, or period expiry revoke it. Duplicate and out-of-order provider events cannot roll entitlement state backward.

The worker calls OpenAI GPT Image 2 through Vercel AI Gateway. It requests 1024×1024 medium-quality PNG candidates, uses OpenAI's default `auto` moderation setting, retries temporary provider failures twice, and applies a three-minute request timeout. Gateway credentials and provider credentials remain server-side.

## API flow

1. `POST /api/image-generations` with a Bearer token, an `Idempotency-Key` header, and the doctrine-defined candidate count for the player's effective tier.
2. A trusted scheduler calls `POST /api/internal/image-generation/process` with `x-accl-image-generation-secret`.
3. `GET /api/image-generations/:id` polls request and candidate metadata.
4. `POST /api/image-generations/:id/candidates/:candidateId/access` creates a private, 60-second signed URL.
5. `POST /api/image-generations/:id/approve` with `{ "candidate_id": "..." }` selects the winner.
6. `POST /api/profile/imagery` with `{ "candidate_id": "...", "surface": "profile_image" }` publishes and places a still derivative.

`GET /api/image-generations/entitlements` gives the UI the two relevant booleans without trusting editable user metadata.

## Capture protection contract

- Android native: use a secure window while an unapproved candidate is visible; normal screenshots and recordings are expected to be blocked.
- iOS native: cover the candidate while capture/mirroring is active. Screenshot notification occurs after capture, so no absolute screenshot-blocking claim is made.
- Web: keyboard/context-menu signals may temporarily cover and disable candidate interaction. This is a deterrent only; browsers cannot stop OS-level screenshots or external cameras.

## Deployment order

1. Apply the database migration to Supabase staging.
2. Connect OpenAI GPT Image 2 through Vercel AI Gateway.
3. Connect Pro billing to entitlements.
4. Schedule the generation worker.
5. Add moderation and safety rules.
6. Create placement derivatives.
7. Run the complete staging flow.

The foundation, token-economy, tier-contract, refinement, saved-lineage, and advisor-hardening migrations have been applied and validated in the disposable ACCL staging Supabase project. Production remains untouched.

The local `image_generation_review_expiry_recovery`, `image_generation_durable_idempotent_replays`, and `image_generation_foreign_key_indexes` migrations are prepared for an approved staging review stack. None has been applied remotely. The foreign-key index migration covers refinement-to-candidate and request-to-parent-creation lineage so those integrity checks remain efficient as generation history grows.

## Controlled live staging checkpoint — 2026-08-31

The feature preview for commit `2addd38` completed the controlled provider checkpoint without touching production or using a paid balance:

1. Vercel AI Gateway showed `$4.91` of free credit and disabled automatic reload before the run.
2. The branch-scoped preview model was temporarily changed from `openai/gpt-image-2` to the current Gateway slug `prodia/flux-fast-schnell`.
3. A clearly identified disposable Plus player received one audited test token, while a second disposable authenticated player was reserved for cross-account denial testing.
4. The public browser flow authenticated the owner, reported the Plus contract, and accepted exactly one idempotent four-candidate commission. The request stored `membership_tier = plus`, `candidate_count = 4`, `token_state = reserved`, and the temporary Flux model.
5. The preview-only queue secret was rotated, and the trusted worker was invoked exactly once. It claimed the commission on attempt 1 and finalized it in `review` with four moderated 1024×1024 PNG candidates.
6. All four private candidates appeared together on the candidate-review screen. The provider receipt recorded four images, 4,138,022 output bytes, and `$0.01000000` of Gateway cost; the visible free-credit balance moved from `$4.91` to `$4.90`.
7. An unauthenticated request received HTTP 401. The second authenticated player received HTTP 404 for both the commission and a candidate signed-access request, while the owner review screen successfully loaded all four private images.
8. The four Storage objects were removed through the Storage API. Both disposable users and all associated entitlement, token, request, candidate, and cost-event rows were then removed and verified absent.
9. `openai/gpt-image-2` was restored on the feature branch, the preview was redeployed to Ready, and the clean unauthenticated generator showed no candidate images. The temporary staging-only HTTP extension used to deliver the authorized worker call was removed.

The controlled live provider checkpoint is complete. The intended ACCL model remains `openai/gpt-image-2`; Flux Schnell was used only for this bounded free-credit validation.

## Token issuance and cost-control staging checkpoint — 2026-08-31

- The feature preview for commit `2654a75` built successfully and reached Ready.
- The consolidated cost-control migration is applied only to disposable staging. Provider and derivative receipts are server-only, immutable to application code, and guarded by idempotency keys.
- Disposable transactional probes verified cost-ceiling enforcement, mismatched-idempotency rejection, no unaudited provider retry, and complete rollback of probe rows.
- Pro anniversary timing now comes from Stripe's subscription start timestamp. The trusted mint pass runs independently of provider availability, grants five tokens once per completed year, and selects one effective active Pro subscription per player so overlapping rows do not stack benefits.
- A service-only compatibility overload keeps entitlement sync available during a migration-first rollout. It records the subscription start as pending and cannot issue anniversary tokens until a newer webhook supplies the provider-authoritative timestamp.
- A rollback-only staging probe with two active subscription rows produced one five-token anniversary grant, one immutable ledger event, and no second-run grant. Anonymous and authenticated roles cannot execute the anniversary mint functions; only the service role can.
- Supabase security and performance advisors report no findings against the new cost-control or anniversary functions. Fresh supporting indexes may remain informationally unused until staging traffic exercises them.
- The browser presentation check passed against the feature alias under reduced-motion mode with no page errors. Production remains untouched.
