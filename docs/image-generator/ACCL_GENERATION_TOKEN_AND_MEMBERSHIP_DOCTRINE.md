# ACCL Generation Token and Membership Identity Doctrine

**Status:** Product doctrine locked by owner approval

**Locked:** August 31, 2026

**Scope:** Generation Tokens, the Sovereign Atelier, the Vault, membership generation allowances, profile imagery, animation visibility, saved-creation evolution, and shared cosmetic progression
**Implementation status:** Implementation and disposable-staging validation are in progress on `feature/image-generator-slice-1`; production remains unchanged and the complete live provider flow is not yet declared finished

---

## 1. Canonical Product Decision

The official player-facing generation currency is the **ACCL Generation Token**.

The name has an intentional double meaning:

1. it is the entitlement spent to commission ACCL-generated imagery; and
2. it is represented as a minted coin appropriate to ACCL's medieval-fantasy world.

Players must not see generic provider language such as API credit, model credit, or AI quota. The experience is framed as spending a minted token to commission work from the **Sovereign Atelier**.

One Generation Token opens one complete commission under the privileges of the player's effective membership tier at the time of redemption.

---

## 2. Permanent Token Identity

The ACCL Generation Token has one permanent, canonical visual identity.

- It is a medieval-fantasy coin.
- It has its own ACCL-native illustration and emblem.
- The token image is universal across Free, Plus, and Pro.
- Approved ACCL Internal Unlimited accounts use the same canonical token; the Vault displays an infinite balance rather than a different coin.
- Membership tiers do not recolor, replace, or create separate token denominations.
- Tier differences affect mint rate and commission privileges, not the token's identity.
- The token must remain legible as both a small balance icon and a larger Vault collectible.

The canonical token-art direction is **set in stone**. Exact asset production and final art approval may occur in a separate design pass, but engineering must reserve one canonical asset identity rather than inventing tier-specific token artwork.

---

## 3. Token Treasury and Vault

Generation Tokens live in the player's Vault as visible inventory.

The Vault presentation must provide:

- the canonical token image;
- the player's available balance;
- a clear explanation of what one token commissions at the player's current tier;
- a **Use Token** action; and
- a token ledger showing mint, reward, redemption, refund, and administrative adjustment events.

Selecting **Use Token** opens:

```text
Vault
→ ACCL Generation Token
→ Use Token
→ Edit Profile
→ Sovereign Atelier / Image Generator
```

The same token balance and redemption action must also be available directly inside Edit Profile during image generation.

Unused tokens carry over. They are not silently removed by a weekly or monthly reset. Any future expiration, transfer, purchase, gifting, or exchange policy requires a separate owner-approved doctrine change.

---

## 4. Ledger and Redemption Authority

Token accounting must be server-authoritative and auditable.

Each ledger entry must record at least:

- player;
- amount;
- event type;
- source;
- membership tier at mint or redemption;
- related rating milestone, subscription period, anniversary, or generation request where applicable;
- idempotency reference; and
- timestamp.

Required event types include:

- `rating_milestone_mint`
- `plus_weekly_mint`
- `pro_weekly_mint`
- `pro_anniversary_mint`
- `commission_reservation`
- `commission_spend`
- `commission_refund`
- `administrative_adjustment`

A token is reserved when the player confirms a commission. It becomes spent when trusted generation processing begins. A failed commission that produces no reviewable result returns the reserved token. Cancelling before processing also returns it. Retries within the same commission must not spend additional tokens unless the player explicitly begins a separately priced commission.

Client-side balance displays are informational only. They cannot mint, spend, or refund tokens.

---

## 5. Historical-Peak Rating Reward

A Free player receives one Generation Token the first time the player reaches a new eligible rating bracket.

The reward follows historical-peak authority:

- crossing an eligible bracket for the first time mints one token;
- dropping below that bracket does not remove the token or earned imagery;
- returning to an already rewarded bracket does not mint another token; and
- only a newly surpassed eligible historical peak may mint the next rating reward.

This rule prevents farming tokens through repeated downgrade and re-upgrade cycles.

Rating-earned tokens are permanent progression rewards. They are independent of the recurring paid-tier mint. Paid-tier weekly allowances replace one another, but a legitimate one-time rating reward may still be added to the player's Treasury.

---

## 6. Membership Mint Hierarchy

Recurring paid-tier mint rates use replacement inheritance, not addition.

| Effective tier | Recurring mint | Inheritance rule |
|---|---:|---|
| Free | None | May earn one-time historical-peak rating rewards |
| Plus | 2 Generation Tokens per week | Replaces Free recurring allowance |
| Pro | 4 Generation Tokens per week | Replaces Plus; does not become 6 |
| Internal Unlimited | Infinite Generation Tokens | Hidden ACCL-controlled test/operations plan; never sold publicly |

Pro is exactly twice the Plus recurring mint.

Weekly minting must be idempotent. A delayed scheduler may catch up a missed authorized mint, but it must never duplicate the same weekly grant.

On each Pro membership anniversary, the player receives **5 additional Generation Tokens** for discretionary Pro commissions. The anniversary grant is separate from the normal weekly mint and occurs once per completed eligible membership year.

---

## 7. Free Commission Contract

One Free-tier Generation Token commissions:

- one prompt-guided generation;
- up to one permitted reference image;
- three private candidates;
- one accepted final image; and
- placement as either the profile icon or the profile background.

Free does not receive both placements from the same commission.

Free imagery is published as a still. Permanent profile animation is not included.

---

## 8. Plus Commission Contract

Plus receives two recurring Generation Tokens per week, with carryover.

One Plus-tier Generation Token commissions:

- up to one permitted reference-image upload;
- four initial private candidates;
- one guided touch-up request against a selected direction;
- two additional candidates from that touch-up;
- review of all six candidates together; and
- acceptance of any one of the six.

The accepted result may be placed as either:

- profile icon; or
- profile background.

It is not a paired placement at Plus.

### Plus motion rights

Plus may apply restrained permanent motion treatments to:

- the profile icon;
- the profile background; and
- the membership/rating badge.

Plus motion is player-facing to the profile owner only. Other players, profile visitors, community surfaces, chat, public spaces, and games receive a still-frame representation.

---

## 9. Pro Commission Contract

Pro receives four recurring Generation Tokens per week, with carryover. This replaces the Plus rate rather than stacking with it.

One Pro-tier Generation Token commissions:

- up to two permitted reference-image uploads;
- five initial private identity concepts;
- up to four guided regeneration requests within the commission;
- two additional candidates per guided request;
- review of the original and regenerated directions;
- selection of one winning identity direction; and
- delivery of a matching profile-icon and profile-background set.

The expected maximum review pool is:

```text
5 initial candidates
+ 4 guided requests × 2 candidates
= 13 review candidates
```

The player chooses the winning identity direction. ACCL then produces or derives the coordinated icon/background pair from that selected direction. Rejected concepts do not require fully materialized paired profile assets.

The final Pro set may be placed together. The player does not have to spend separate commissions to obtain the matching icon and background.

### Pro motion rights

Pro receives the broader active-presentation rights:

- approved profile visitors may see the player's permitted profile animation;
- profile icon motion may carry into chat, authorized public spaces, and games;
- profile background motion remains attached to appropriate profile-facing presentation;
- badge motion follows the membership and prestige ladder; and
- relic, reward, badge, icon, and background treatments may use the active Pro progression package.

Every animated surface must still provide an accessible still fallback and honor reduced-motion preferences.

### Internal Unlimited contract

ACCL may grant a hidden **Internal Unlimited** plan to explicitly approved company-controlled accounts.

- Access is tied to an exact, currently verified email address.
- An exact email may be pre-approved before signup, but access remains pending until that address creates and verifies its ACCL account.
- It is never inferred from a domain and never awarded by browser code.
- The plan includes unlimited permitted reference-image uploads over time.
- The Vault displays **∞ Generation Tokens**.
- Commission and refinement token-use events remain auditable, but the visible token balance never decreases.
- Internal Unlimited inherits all Pro generation, matching-set, placement, saved-creation, and motion rights.
- It requires no card, checkout, or public subscription.
- It remains subject to moderation, abuse prevention, provider logging, and an invisible emergency cost ceiling.
- Revocation stops future Unlimited use without deleting the player's legitimate creations or history.
- If the account's verified email changes, Unlimited access stops until the new exact address is explicitly approved.

Internal Unlimited is an operational entitlement, not a public membership tier, competitive achievement, or status other players can purchase.

---

## 10. Saved Creations and Pro Evolution

Approved creations are preserved in the player's private Saved Creations collection and may be represented in the Vault.

Pro players may spend a Generation Token to further a past saved creation:

```text
Vault or Saved Creations
→ Choose creation
→ Further This Creation
→ Add guidance and permitted references
→ Confirm Generation Token
→ Create a new private branch
```

Furthering a creation must never overwrite the source asset.

The system must preserve:

- the original creation;
- the newly evolved branch;
- parent/child lineage;
- prompts and approved guidance metadata;
- accepted placement derivatives; and
- the ability to restore an earlier accepted version.

This gives Pro imagery an artistic lineage while protecting previously earned and approved work.

---

## 11. Shared Progression Doctrine

The same progression authority must carry across:

- profile icon;
- profile background;
- badge;
- relics;
- rewards;
- membership-ladder treatments;
- upgrade presentation;
- downgrade presentation;
- Vault displays; and
- future approved cosmetic surfaces.

These systems must not implement separate, contradictory tier ladders. A central capability model determines the player's active treatment on every surface.

The current effective membership tier controls:

- candidate and reference limits;
- guided regeneration rights;
- single placement versus paired set delivery;
- available motion families;
- who may see motion;
- which public surfaces may render motion; and
- which still fallback must be served.

Competitive rating progression and paid membership remain distinct authorities:

- rating and achievement determine earned prestige state;
- membership determines active premium presentation privileges; and
- membership must never fabricate rating, rank, title, tournament authority, or competitive accomplishment.

---

## 12. Upgrade and Downgrade Rules

Players never lose legitimate ownership because of a membership change.

An upgrade or downgrade must preserve:

- Generation Token balance;
- historical rating rewards;
- approved imagery;
- saved-creation lineage;
- relics;
- rewards;
- badges;
- earned prestige history; and
- owned cosmetic packages.

The current effective tier changes active privileges rather than deleting ownership.

### Upgrade

An upgrade immediately enables the higher tier's eligible generation, placement, and motion capabilities. Newly redeemed commissions use the effective tier at redemption.

### Downgrade

A downgrade:

- stops the higher recurring mint and begins the lower authorized mint;
- preserves banked tokens;
- preserves matching Pro sets and all saved creations;
- pauses motion that the lower tier cannot display;
- serves the correct still or lower-tier presentation to restricted surfaces; and
- restores eligible higher-tier treatments if the player later upgrades again.

Downgrading must not destructively flatten, overwrite, or delete the underlying premium assets.

---

## 13. Surface Visibility Matrix

| Surface | Free | Plus | Pro |
|---|---|---|---|
| Owner viewing own icon | Still | Subtle motion permitted | Expanded motion permitted |
| Owner viewing own background | Still | Subtle motion permitted | Expanded motion permitted |
| Owner viewing own badge | Still | Subtle motion permitted | Progression motion permitted |
| Another player viewing profile | Still | Still | Authorized motion permitted |
| Community/public listing | Still | Still | Only explicitly authorized Pro motion |
| Chat | Still | Still | Animated icon permitted |
| Game surface | Still | Still | Animated icon permitted where performance-safe |
| Reduced-motion preference | Still/reduced | Still/reduced | Still/reduced |

Public animation must be granted deliberately per surface. Pro status is not permission to animate arbitrary components or interfere with gameplay clarity.

---

## 14. Privacy, Moderation, and Placement

All candidates and evolved branches remain private until accepted.

- Nothing publishes automatically.
- Candidate originals remain protected private assets.
- Prompts, references, and candidates pass the approved moderation pipeline.
- Rejected candidates remain private and follow the approved retention policy.
- Public placement uses optimized derivatives.
- Still derivatives must always exist, including for motion-enabled assets.
- Community clients must not receive private candidate URLs.
- Motion visibility must be enforced by trusted entitlement checks, not only hidden with client-side CSS.

Capture-protection limitations remain governed by the Image Generator foundation: mobile platforms use their strongest supported controls, while web protection is deterrence rather than guaranteed screenshot prevention.

---

## 15. Cost-Control Directive

Membership promises are measured as complete commissions, not as unlimited image calls.

Engineering must:

- use idempotent requests;
- treat provider retries as part of the same commission;
- avoid generating paired Pro placement assets for rejected concepts;
- create the final matching set only after the winning direction is selected;
- track actual provider and derivative cost per commission;
- preserve still derivatives for efficient public delivery; and
- expose operator controls for abuse, runaway retry, and spend limits.

The player-facing product remains the ACCL Generation Token. Provider pricing and implementation metering remain internal operational concerns.

---

## 16. Canonical Terminology

Use these terms consistently:

| Product term | Meaning |
|---|---|
| **ACCL Generation Token** | Canonical coin and commission entitlement |
| **Token Treasury** | Player's available Generation Token balance |
| **Token Ledger** | Auditable mint, spend, and refund history |
| **Sovereign Atelier** | ACCL's image-generation experience |
| **Commission** | One token-funded generation workflow |
| **Guided touch-up** | Plus refinement request producing two candidates |
| **Guided regeneration** | Pro refinement request producing two candidates |
| **Matching set** | Coordinated Pro profile icon and background |
| **Saved Creations** | Private versioned collection of approved imagery |
| **Further This Creation** | Pro token-funded evolution of a saved creation |
| **Anniversary mint** | Five-token Pro membership anniversary reward |

Do not call recurring commissions "uploads." An upload is a reference image supplied to guide a commission. A Generation Token is the entitlement spent to begin the commission.

---

## 17. Implementation Boundary

This doctrine supersedes the early Pro-only product assumptions in `docs/IMAGE_GENERATOR_SLICE_1_FOUNDATION.md` for future membership and progression work.

It does **not** declare the current runtime complete. The existing Slice 1 implementation remains the deployed technical foundation until separately approved migrations, APIs, UI, billing rules, token ledgers, Vault integration, animation adapters, and tier enforcement are built and validated.

Production must not be changed merely because this document is locked.

---

## 18. Locked Summary

The following decisions are locked:

1. ACCL Generation Tokens are medieval-fantasy coins and the official generation entitlement.
2. The token uses one permanent canonical image across all tiers.
3. Tokens appear and wait in the player's Vault and are usable from Vault or Edit Profile.
4. Unused tokens carry over.
5. First-time historical rating-bracket ascent may award one token; repeat crossings do not.
6. Plus mints two tokens weekly.
7. Pro mints four tokens weekly, replacing rather than stacking with Plus.
8. Pro receives five anniversary tokens.
9. Free reviews three candidates and chooses icon or background.
10. Plus reviews four originals plus two guided-touch-up candidates and chooses icon or background.
11. Plus icon, background, and badge motion is owner-facing only.
12. Pro receives a matching icon/background set from one commission.
13. Pro has five initial concepts and four two-candidate guided regeneration requests.
14. Pro can spend tokens to evolve saved creations without overwriting originals.
15. Pro motion may appear on authorized profile, chat, public, game, and badge surfaces.
16. Exact verified ACCL-controlled emails may receive hidden Internal Unlimited access with unlimited uploads and ∞ Generation Tokens.
17. Internal Unlimited token use is audited without decreasing the displayed balance and never bypasses safety or cost controls.
16. Relics, rewards, badges, imagery, and upgrade/downgrade presentation share one progression authority.
17. Membership changes alter active privileges but do not delete owned progression or assets.
18. Public still fallbacks, privacy, moderation, accessibility, and competitive integrity remain mandatory.
