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
2. **Generation build-up — evaluate `preloader`, `thinking-dots`, and `tech-wall`**
   - Use one ambient effect only.
   - Must honor reduced-motion and mobile performance limits.
3. **First candidate reveal — evaluate `pixel-reveal`, `shader-reveal`, and `particle-image`**
   - The effect presents a candidate; it must never alter the stored image.
4. **Private holding treatment — evaluate `frame-border`, `minimal-ripple`, and restrained `flicker`**
   - Motion exists only while the candidate is awaiting approval.
5. **Candidate review — evaluate `card-spread` only if a plain accessible four-card grid does not provide sufficient clarity**
6. **Later profile-facing motion — possible sources include `flicker`, `glowing-wave`, `aura-blob`, and `frame-border`**
   - Not part of the current build.
   - Community views remain still-only.

## Explicit exclusions for the Create screen

- File attachments and reference-image uploads
- Model selectors or provider names
- Token counters
- Ask/agent/edit modes
- Public sharing
- Automatic profile placement
- Motion on a placed image

The ACCL host design system wins: React Bits source is harmonized to ACCL colors, typography, spacing, radii, accessibility, and motion rules.
