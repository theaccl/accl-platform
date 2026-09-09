# Battlefield membership access

Owner decision recorded September 9, 2026, as part of ACCL's first-launch membership policy.

Standard is the minimum membership required to enter Battlefield.

| Membership | Meets Battlefield membership requirement |
|---|---|
| Free | No |
| Standard | Yes |
| Plus | Yes |
| Pro | Yes |

This is a membership requirement, separate from Image Generator tokens and candidate/keep allowances. Meeting it does not bypass other Battlefield eligibility requirements.

Implementation status: implemented locally on the free-join and paid-entry server paths, with a database trigger protecting alternative entry inserts. Local tests verify Free denial, paid-tier eligibility, existing-entry recovery and denial before payment-provider work. New migrations/application changes await remote approval. Hosted simultaneous sessions and payment completion after membership expiry remain launch gates; see the [implementation evidence](../image-generator/GENERATOR_LAUNCH_IMPLEMENTATION_2026_09_09.md).

Related: [Generator first-launch policy](../image-generator/GENERATOR_LAUNCH_POLICY_2026_09_09.md).
