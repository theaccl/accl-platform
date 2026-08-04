---
record_type: doctrine_authority_crosswalk
status: canonical_documentation
authority_scope: documentary
operational_authority: none
production_authority: none
source_branch: docs/accl-avatar-domain-prestige-doctrine
source_commit: 3c49b981643cf28e36f316d33c474ba79260f7f6
source_blob: 5cee110a82a907a3bb38cdec545473632de82636
---

# ACCL Avatar and Prestige Doctrine Authority Crosswalk

## Controlling doctrine

`docs/accl-avatar-domain-theme-prestige-progression-doctrine.md` is the controlling documentary authority for:

- foundational Red, Blue, Black, and White identity themes;
- historical-peak unlock authority;
- avatar and profile-domain visual translation;
- earned prestige materials and their visual progression;
- paid-package ownership, selection, carry-forward, upgrade, and downgrade behavior;
- Trainer theme translation;
- future coordination between avatar/domain presentation and badge presentation.

The restored doctrine is documentation only. Its inclusion does not implement a storefront, payment system, generator, schema, migration, runtime behavior, deployment, or production permission.

## Authority separation

The following authority boundaries remain controlling:

1. Rating calculation, rating settlement, matchmaking, tournaments, scholarships, payouts, verification, titles, and queue priority are not controlled by cosmetics.
2. Overall, Tournament, Bullet, Blitz, Rapid, Daily, and exact-control rating tracks remain separate.
3. Official rating and status accents are earned automatically. They cannot be manually selected, purchased, or imitated.
4. Purchased cosmetics cannot grant rating, prestige, badge authority, competitive advantage, or administrative authority.
5. Earned prestige materials are never sold.
6. Badge implementation remains governed by `docs/accl-badge-phase-1-consolidated-spec.md`. The badge specification’s SQL-first material ordering (Iron through Obsidian) controls badge implementation only. It does not automatically control avatar/domain prestige materials, and the badge specification must not defer to the restored avatar/prestige doctrine for shared prestige-material meaning until a joint owner/PO lock explicitly reconciles the vocabularies.
7. Rating runtime and display behavior remain governed by the current canonical rating and ticker documents; those documents do not replace avatar, package, carry-forward, or prestige-material doctrine.

## Documentary reconciliations

### Terminal title and uncapped rating

The current canonical overall-rating doctrine in `docs/accl-stage1-canonical-overall-rating-doctrine.md` controls:

- ACCL Sovereign Eternal begins at 3600+.
- ACCL Overall remains uncapped.
- “ACCL Sovereign Master” at 3000–3199 and “ACCL Mercury Sovereign” at 3200+ in the restored historical doctrine are presentation/material-tier labels only.
- Those restored labels do not establish a rating ceiling or terminal competitive title.
- Any remaining terminal-title mapping question remains pending the applicable PO lock.

### Prestige-material vocabulary

Two prestige-material vocabularies currently exist in separate documents:

- Badge specification: Iron and Obsidian (SQL-first ordering Iron → Bronze → Silver → Gold → Platinum → Diamond → Obsidian).
- Restored prestige doctrine: Forged Steel, Lava, and Mercury (Part IV locked pecking order).

Neither vocabulary is cross-binding until a joint owner/PO lock explicitly reconciles them. The badge specification’s SQL-first ordering controls badge implementation only. It does not automatically control avatar/domain prestige materials. This crosswalk does not require the badge specification to defer to the restored doctrine for shared prestige-material meaning.

### Zone-source separation

Zone sources remain separate:

- Badge zones derive from per-exact-clock `settlement_rating`.
- Avatar/domain zones derive from ACCL Overall.
- A player’s badge and avatar/domain surfaces may therefore display different zones concurrently without constituting a conflict.

Restored-doctrine language about future badge/theme dual-tracker coordination is documentary and future-facing only. It does not override this zone-source separation and does not authorize badge runtime changes.

### Internal restored-doctrine precedence

Within the restored historical document only:

- Part IV supersedes Part I §13 and §15 Gold-first illustrations.
- Part IV §2 updates and supersedes Part II §24’s statement that the material mapping was not locked.
- This internal precedence does not make the Part IV vocabulary binding upon the separate badge specification.

### Superseded ceiling language

Every “current summit,” “ceiling extension,” or equivalent finite-rating-ceiling concept in the restored doctrine—including Part III’s Mercury Sovereign summit framing and Part IV’s “Reserved for future ceiling extension” language—is superseded by the current uncapped ACCL Overall doctrine. Those restored passages remain historical documentary text; they do not establish a rating ceiling.

## Identity-layer separation

These remain separate systems even when a package coordinates their appearance:

- badge;
- avatar;
- profile domain;
- companion;
- Trainer;
- AI bot;
- board and pieces;
- package ownership;
- Vault storage;
- active presentation;
- archived presentation.

A cosmetic package may coordinate eligible surfaces, but it does not merge their identities, records, permissions, or authority.

## Ownership and progression locks

- Purchased packages remain owned unless later owner doctrine expressly changes that rule.
- Packages may be selected and unselected.
- Eligible package visuals carry into future rating blocks.
- Active presentation may upgrade or downgrade with the player’s current block.
- Historical achievement remains separately recorded.
- Paid control does not grant prestige.
- Purchased visuals cannot counterfeit earned materials or official status.
- Badge implementation remains deferred until separately reviewed and authorized.

## Guardian and catalog boundary

K–12 restrictions override ownership, payment, membership, and progression:

- K–12-safe catalogs only;
- adult and K–12 package separation;
- guardian review where required;
- no monetization pressure;
- no adult-lane leakage.

The documentary basis for the guardian-review boundary is `docs/doctrine/once-used-identity-recovery-doctrine.md` (including its K–12 and scholarship records / `guardian_review` treatment).

Catalog age-gating mechanics remain open PO decisions under restored Part II §25 items 10–11. This crosswalk does not invent or lock exact age thresholds, verification workflows, or guardian-consent implementation.

## Accessibility boundary

Theme, material, badge, and prestige meaning must not rely on color alone. Future implementation requires contrast, readable labels, non-color status indicators, reduced-motion support where relevant, and equivalent accessible identification.

## Source custody

The controlling text was restored exactly from:

- Branch: `docs/accl-avatar-domain-prestige-doctrine`
- Commit: `3c49b981643cf28e36f316d33c474ba79260f7f6`
- Blob: `5cee110a82a907a3bb38cdec545473632de82636`

The historical source branch remains preserved during review. It becomes eligible for a separate retirement decision only after this package is merged and the merged tree is audited.

## Promotion boundary

This crosswalk proposes documentary reconciliation only.

- Documentation only
- No runtime authority
- No operational or production authority
- No schema or migration authority
- No payment implementation
- No deployment authorization

- Operational authority promoted: none
- Production authority promoted: none
- Runtime implementation authorized: none
- Database or migration execution authorized: none
- Payment implementation authorized: none
- Deployment authorized: none
