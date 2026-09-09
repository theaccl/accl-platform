# ACCL Image Generator — first-launch policy

Policy identifier: `generator-launch-2026-09-09`.

Owner decisions recorded September 9, 2026. This replaces conflicting membership allowances and acceptance counts in the August 31 doctrine. These are conservative launch benefits, not permanent maximum generosity. Future increases require an explicit policy revision when affordable; subscriber growth does not automatically activate larger benefits.

**Implementation status:** authoritative product policy, not yet implemented across the application/database. Preview commit `39544a5` still uses the previous contracts. Do not describe the table below as deployed behavior or mark existing single-winner tests as proof of it.

## Launch contracts

| Tier | Generation Token allowance | Candidate selections | May keep | Subscription-token balance cap |
|---|---|---:|---:|---:|
| Free | One signup commission plus one additional retry commission, both started by the player | Free candidate count was not revised by this decision | Free keep count was not revised by this decision | No recurring allowance |
| Standard | 2 per month | 1 | 1 | 4 |
| Plus | 2 per week | 2 | 2 | 4 |
| Pro | 4 per week | 3 | 2 | 8 |

The owner's candidate-count correction replaces the earlier 3/4/5 counts with 1/2/3. The subsequent keep-limit correction sets Standard to keep 1, Plus to keep 2 and Pro to keep 2. Pro includes a still profile image and a background image. The intervening suggestion to reduce candidate counts by one is superseded by the explicit final 1/2/3 instruction. Free signup/retry benefits were not changed by these three-tier corrections.

The final owner correction explicitly retains rollover at launch. The cap is twice the tier's token allowance: an allowance of 5 would have a cap of 10. The actual stated allowances above produce caps of 4, 4 and 8. Candidate count and number of kept images are separate quantities and do not determine the token cap.

The earlier discussion of expiring Standard/Plus credits or postponing rollover is superseded. Capped accrual should stop a new subscription mint from exceeding its cap, not silently erase previously held tokens. Earned rewards, signup benefits and legitimate issue replacements require separate source accounting; a capped subscription mint must not swallow a valid replacement.

Keep limits concern retained creations. Pro explicitly includes still profile imagery and a background image. Existing privacy and motion rules remain separate and must not be expanded merely because more images can be kept. The initial candidate counts do not silently remove or authorize additional paid touch-ups. Reconcile legacy guided refinements, Pro anniversary benefits and reward accounting explicitly during implementation.

Related platform requirement: [Battlefield requires Standard membership or above](../doctrine/BATTLEFIELD_MEMBERSHIP_ACCESS.md). Free cannot enter Battlefield. This access requirement is independent of the Generator token balance.

## Issue reports

Tokens are used when generation processing starts. A player may report an issue and select manual or AI review. A legitimate issue replaces the spent token once. AI can approve supported legitimate cases automatically; uncertainty goes to manual review. Submission alone does not return tokens. Preserve the original spend, reviewer evidence and a unique replacement event. A token already returned by automatic recovery cannot be replaced again. Internal Unlimited never receives a replacement for a token it did not spend.

## Policy evolution

Record the policy version and tier on a commission when it is created, and on an allowance when it is granted. Later changes must preserve the prior spending ledger and the privileges already granted to existing commissions. Do not retroactively reinterpret old commissions or delete old artwork to enforce a new policy.

Before enabling this policy, implement and test Standard membership resolution, idempotent signup/retry grants, monthly and weekly mints, capped rollover under concurrency, upgrade/downgrade transitions, source-aware token accounting, and atomic selection of the permitted kept set. Test all counters with fixtures and fake time; no provider calls are needed.

## Testing economics

Use the [low-cost testing handoff](LOW_COST_TESTING_HANDOFF_2026_09_09.md). Routine functional tests use mocks or stored fixture images. Real generations are reserved for actual provider integration or visual-quality evidence. Preserve successful examples for future reuse. Nothing in this policy authorizes subscription cancellation, production changes or increased provider spending.
