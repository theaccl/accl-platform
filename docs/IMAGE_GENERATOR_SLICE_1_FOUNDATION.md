# Image Generator Slice 1 foundation

This branch implements the Generation Token economy, Free/Plus/Pro/Internal Unlimited contracts, private candidate workflow, guided refinements, saved-creation lineage, placement derivatives, audience-aware motion policy, and the React Bits candidate presentation layer.

The owner-approved source of truth is [`docs/image-generator/ACCL_GENERATION_TOKEN_AND_MEMBERSHIP_DOCTRINE.md`](image-generator/ACCL_GENERATION_TOKEN_AND_MEMBERSHIP_DOCTRINE.md). This foundation document describes the implemented runtime and must not be used to re-open settled membership rules.

## Implemented product behavior

- A Generation Token commissions one opening generation. Internal Unlimited commissions are still written to the audit ledger at zero displayed cost.
- Free receives 3 opening candidates, Plus receives 4, and Pro/Internal Unlimited receive 5.
- Free and Plus accept one private reference and place either an icon or background. Pro/Internal Unlimited accept two references and may place a matching icon/background set.
- Plus receives one guided touch-up producing 2 more candidates. Pro/Internal Unlimited receive up to four guided refinements producing 2 candidates each.
- Candidate review lasts 24 hours.
- Exactly one candidate may be approved. The approval transaction rejects the remaining candidates.
- Accepted candidates remain private saved creations with immutable parent/root lineage. Pro/Internal Unlimited may spend a new commission token to further a saved creation.
- Placement publishes a still derivative. Candidate originals remain in the private bucket.
- Motion visibility is resolved server-side by membership, surface, and viewer audience. Reduced-motion preferences always receive the still fallback.

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

## Controlled live staging checkpoint — 2026-08-31

The feature preview for commit `85530af` was verified Ready before and after the following controlled run:

1. The branch-scoped preview model was temporarily changed from `openai/gpt-image-2` to the current Gateway slug `prodia/flux-fast-schnell`.
2. A clearly identified disposable Plus player received one audited test token.
3. The public API authenticated the player, reported the Plus contract, and accepted exactly one idempotent four-candidate commission with HTTP 202.
4. The request stored `membership_tier = plus`, `candidate_count = 4`, `token_state = reserved`, and the temporary Flux model.
5. The owner could read the queued request. An anonymous reader received HTTP 401, and an unauthenticated worker invocation also received HTTP 401.
6. The provider call was deliberately not bypassed: preview deployments do not run Vercel Cron, and the worker credential is an unrevealable server secret. Rotating that credential requires action-time authorization.
7. `openai/gpt-image-2` was restored, the feature preview was redeployed to Ready, and the disposable player, queued request, entitlement, and token rows were removed. No candidate objects were created by this checkpoint.

The remaining live checkpoint is to invoke the trusted preview worker once through an authorized credential path, verify all four private candidates together, test a different authenticated user against candidate access, remove the resulting objects, and confirm the preview model remains `openai/gpt-image-2`.
