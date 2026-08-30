# Image Generator Slice 1 foundation

This branch implements the non-visual foundation. React Bits is intentionally not required until the candidate-review and presentation layer is built.

## Locked product behavior

- `image_generator` is the Pro entitlement.
- One request may produce 1–4 private candidates.
- Candidate review lasts 24 hours.
- Exactly one candidate may be approved. The approval transaction rejects the remaining candidates.
- An accepted candidate may be placed only as `profile_image` or `profile_background`.
- Placement publishes a still derivative. Candidate originals remain in the private bucket.
- Community surfaces remain still-only. Profile-only motion is represented as a separate `profile_motion` entitlement but is disabled in Slice 1.

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

1. `POST /api/image-generations` with a Bearer token, an `Idempotency-Key` header, and `{ "prompt": "...", "candidate_count": 4 }`.
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

The foundation and advisor-hardening migrations have been applied and validated in the zero-user ACCL staging Supabase project. Production remains untouched.
