# React Bits Pro — ACCL Image Generator Presentation Map

The licensed registries are connected on `feature/image-generator-slice-1`. The license key remains local in ignored `.env.local`; registry URLs and installed source are safe to commit.

## Licensed inventory

- 135 animated components (Tailwind and vanilla CSS variants)
- 238 marketing blocks
- 300 signed-in Application UI blocks
- 19 Agent Kit design items
- Pro does not include the 11 Ultimate templates; ACCL does not need a template for this feature

## Selected path

1. **Generation Prompt/Create — `prompt-input-3`**
   - Installed and rewritten for ACCL.
   - Chosen because it provides a focused hero prompt and suggestion chips without uploads, model selectors, agent modes, or other controls ACCL does not support.
2. **Generation Token / Vault treatment — `flicker`**
   - Installed and harmonized to ACCL's gold/violet palette.
   - Used as a restrained atmospheric layer behind the canonical token card.
   - Decorative motion stops completely when the player requests reduced motion.
3. **Generation build-up — evaluate `preloader`, `thinking-dots`, and `tech-wall`**
   - Use one ambient effect only.
   - Must honor reduced-motion and mobile performance limits.
4. **First candidate reveal — evaluate `pixel-reveal`, `shader-reveal`, and `particle-image`**
   - The effect presents a candidate; it must never alter the stored image.
5. **Private holding treatment — evaluate `frame-border`, `minimal-ripple`, and restrained `flicker`**
   - Motion exists only while the candidate is awaiting approval.
6. **Candidate review — evaluate `card-spread` only if a plain accessible four-card grid does not provide sufficient clarity**
7. **Later profile-facing motion — possible sources include `flicker`, `glowing-wave`, `aura-blob`, and `frame-border`**
   - Not part of the current build.
   - Community views remain still-only.

## Explicit exclusions for the Create screen

- File attachments and reference-image uploads
- Model selectors or provider names
- Ask/agent/edit modes
- Public sharing
- Automatic profile placement
- Motion on a placed image

The ACCL host design system wins: React Bits source is harmonized to ACCL colors, typography, spacing, radii, accessibility, and motion rules.

## Five-system review room

The branch includes a review-only comparison route at `/image-generator/concepts`:

1. **Sovereign Atelier** — premium, ceremonial, and closest to the initial direction
2. **Arena Forge** — competitive, tactical, and intense
3. **Crest Ceremony** — emotional, centered, and identity-led
4. **Midnight Vault** — minimal, private, and modern
5. **Broadcast Reveal** — bold, theatrical, and designed around the player-facing premiere

The concepts share a prompt during comparison, support desktop/mobile preview widths, and cannot call the generation API. The selected direction will replace the live Create presentation only after review.
