# Accept-and-place local review — September 8, 2026

## Scope and result

Reviewed the private candidate → acceptance → profile derivative → assignment flow on `feature/image-generator-slice-1`, starting at `25ac493`. This local stack adds placement checks before image processing, recovery of completed placements, commission-contract UI recovery, and stricter motion termination. It does not declare distributed placement retry handling or the live provider flow complete.

No production changes, remote mutations, provider calls, credential changes, new migrations, or new dependencies were made. The user's existing repository `outputs/` was excluded from inspection and staging. Test images are generated geometric fixtures; no private generated imagery was used.

## Changes

- Both placement APIs require an owner-scoped, approved, moderation-approved candidate and an approved commission with a recognized membership tier before downloading or publishing anything.
- Free/Plus historical placement events are checked before image processing. A known prior icon placement prevents a later background placement, and vice versa. The existing database transaction remains the final authority for concurrent requests.
- A completed placement that is still active on the profile returns its existing validated still derivative. A matching set replays only when both assignments are complete and active. No new encoding, publication, or derivative-cost receipt occurs on this completed replay.
- Manual replacement of a profile path prevents a false replay, so intentionally restoring an earlier accepted image remains possible.
- Recovered commissions use their recorded tier for matching-set and refinement controls. Upgrading does not turn an old Plus commission into a matching-set commission; downgrading does not hide placement of an already-approved Pro commission.
- Community motion is always denied, including when a caller sets the generic public-authorization flag. Unknown tier values and inherited JavaScript object keys fail closed. Plus owner-only and reduced-motion rules are unchanged.
- Acceptance finishes browser animations already running within the candidate review. Merely changing Motion's transition duration did not reliably stop an earlier reveal whose end target was unchanged. Existing image elements stay mounted because their short-lived signed URLs may expire while the user decides.

## Files

- `app/api/profile/imagery/route.ts`
- `app/api/profile/imagery/set/route.ts`
- `lib/imageGenerator/placementPreflight.ts`
- `lib/imageGenerator/membership.ts`
- `lib/imageGenerator/motionPolicy.ts`
- `components/image-generator/ImageGeneratorCreateScreen.tsx`
- `components/image-generator/CandidateReviewGrid.tsx`
- `tests/unit/imageGeneratorPlacementPreflight.spec.ts`
- `tests/unit/imageGeneratorMotionPolicy.spec.ts`
- `tests/unit/imageGeneratorAcceptanceBrowser.spec.ts`
- `tests/unit/imageGeneratorDerivatives.spec.ts`
- `tests/unit/imageGeneratorTierContracts.spec.ts`
- `docs/IMAGE_GENERATOR_SLICE_1_FOUNDATION.md`
- This report.

## Verification

- 110 Image Generator and Generation Token non-browser tests passed. These include executable preflight queries against a filtering test double, membership/surface/audience motion matrices, crop geometry, and metadata stripping. Existing SQL and route contract tests inspect source and do not substitute for transactional database execution.
- Six local browser scenarios cover accept/place retry and approved-link recovery, still reduced-motion review, Pro placement after downgrade, Plus placement after upgrade, clean signed-out Generator/Vault pages, and stale signed-out links.
- The four authenticated browser scenarios use synthetic cookie sessions, synthetic image bytes, and intercepted API responses. They reject non-local application targets and prevent external browser HTTP requests. They prove UI request/response behavior, not live authentication, atomic approval, storage access control, or server first-presentation concurrency.
- The acceptance test initially detected ongoing browser animations. The corrected implementation verifies zero running animations in candidate cards and preserves the original loaded image element.
- Type checking and focused lint passed. The production build passed with process-scoped synthetic local configuration. The initial build without that configuration failed during prerendering because this shell did not have the required Supabase public configuration; no environment file was changed.
- The local browser page rendered successfully. The optional agent-browser CLI was unavailable; the existing Playwright suite and in-app browser were used. Local servers are stopped after verification.
- Final diff-format validation passed. The staged credential-pattern, conflict-marker, and private-media/artifact scans found zero matches. No protected output files were staged.

## Remaining engineering gaps

1. **Distributed placement durability is incomplete.** Completed replay does not serialize in-flight publication. Concurrent requests can still encode/upload twice before the database transaction arbitrates them. The public upload and assignment transaction are separate; crashes may leave orphaned derivatives. Existing failure cleanup can also act on an ambiguous database response. A durable placement operation record, explicit operation identity, and recoverable finalization/cleanup are the next local priority. Do not advertise complete idempotency from this stack.
2. **Browser commission retry identity is incomplete.** Opening generation, guided refinement, and saved-creation evolution currently generate a new idempotency key on each button attempt. Server replays are protected when the same key is reused, but a lost successful response followed by another click can start distinct work (and, for a new commission/evolution, reserve another token). Preserve the confirmed request identity across ambiguous failures in a separate cohesive stack.
3. **Live authorization and first-presentation races still need validation.** The first-presentation route checks request status/expiry, then updates candidate rows in a second operation. The null-only claim prevents ordinary duplicate reveals, but exact expiry/approval races are not proven by the synthetic browser tests.
4. **Motion delivery integration remains incomplete.** The central motion policy is exposed by its API, but no other runtime consumer of `resolveCosmeticMotion` was found. This review proves policy behavior and candidate presentation, not permanent animated assets across every profile/chat/game surface. Final animation styles remain unresolved.
5. **Membership/token foundations need live transactional probes.** Existing ledger code uses row locks, source/idempotency uniqueness, reservation/spend/refund transitions, replacement minting, and exact verified-email Unlimited checks. Local contract tests cover these rules; no remote ledger writes or concurrency probes ran. Saved-creation lineage has server protection, while its browser retry issue is covered above.

## Read-only staging findings

The connected Supabase inventory identified `accl-br1-path-b-disposable`, project `qquttuyopiqxfwzceitc`, as active. Its migration history includes the generator foundation, tier contracts, lineage, cost controls, expiry recovery, durable request replay, and foreign-key indexes.

The migration ledger and a read-only catalog query confirm these two migrations are still pending:

1. `20260902190000_image_generation_durable_storage_cleanup.sql`
2. `20260902193000_image_generation_reference_upload_recovery.sql`

The cleanup table, cleanup-claim function, and pending-upload constraint were absent. Some earlier remote migration timestamps differ from repository filenames; compare names and actual definitions rather than bulk-applying local history. Do not run a blanket migration push.

## Proposed controlled staging plan — approval required

Before this plan runs, obtain approval for the exact local commit to be pushed to `origin/feature/image-generator-slice-1`. Prefer completing the two durability items above before calling this a full reliability validation. Reconfirm the resulting deployment is a feature Preview and its database destination is the disposable project, without exposing environment values.

The bounded staging authorization would cover:

1. Apply only the two migrations named above, in that order, to `qquttuyopiqxfwzceitc`. Check transaction completion, migration records, service-only grants/RLS, indexes, and advisors. Stop on unexpected schema drift.
2. Create one disposable Plus owner and one disposable second account, recording exact IDs. Mint one test token with an explicit unique administrative source. Do not grant Unlimited access or edit an allowlist.
3. Temporarily configure only this feature branch's Preview to `prodia/flux-fast-schnell`, the previously validated text-to-image model. No reference upload or guided refinement is included in this provider run. Vercel's current [model page](https://vercel.com/ai-gateway/models/flux-fast-schnell) lists the model and pricing starting at $0.001 per image; resolve the actual 1024×1024 rate and retry upper bound before invocation.
4. Maximum proposed provider expenditure: **$0.05 of existing free credit**, with no paid balance, card use, or automatic recharge. Confirm the current free balance and disabled recharge immediately before execution. Bound the entire possible call/retry cost below this cap; do not rely solely on a post-spend database ceiling. If this cannot be established, skip provider invocation and report the blocker.
5. With temporary disposable-staging worker controls captured and scoped for restoration, limit the queue to one attempt for this validation and ensure no unrelated queued work can be claimed. Create exactly one four-candidate Plus commission and invoke the worker once. Do not automatically retry the experiment if it fails.
6. Verify all four private candidates together, one first reveal, pre-acceptance holding motion, acceptance of one winner, three rejected cards, immediate motion stop, and approved-link recovery. Verify owner icon placement and completed replay; reject a subsequent background placement and a matching-set request for this Plus commission. Test background and Pro-set happy paths locally until separately approved live fixtures exist.
7. Verify authenticated cross-account denial, signed-out denial, direct private-storage denial, still community imagery, and no exposed secrets or private candidate paths in unrelated/public responses. Record actual ledger events and provider receipts.
8. Restore `openai/gpt-image-2` on the feature Preview, restore only captured temporary worker controls, and verify the restored Preview. Remove only the exact disposable accounts, records, and private/public assets created by this validation; never broad-delete by date, bucket or naming prefix. Include any pending cleanup jobs in the exact manifest. Handle session revocation before account removal where supported. No queue-secret rotation is included unless separately approved or a concrete exposure requires a new approval.

This plan is prepared for review, not executed. It does not authorize production changes, new paid services, a second commission, a Pro provider run, or permanent model changes.
