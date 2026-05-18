# ACCL Design Direction v1.0 (Visual Constitution)

**Status:** Foundation reference for Phase 1A tokens and primitives.  
**Integrity tie-in:** See `docs/security/ACCL_9_LAYER_ANTI_CHEAT_ARCHITECTURE.md` — UI must not imply real-time engine access where Layer 7 blocks analysis; status colors are informational only.

## Principles

1. **Arena darkness, crimson accent** — Command-center feel; red signals primary actions, not error-only.
2. **Typography hierarchy** — Display (condensed) for arena titles; interface sans for body; monospace for ratings, clocks, snapshot IDs.
3. **Elevation through border + inset shadow** — Avoid flat gray slabs; subtle `border-white/[0.06]` style expressed as semantic tokens.
4. **Motion** — Hover/focus only in Phase 1A; no motion system.
5. **No decorative redesign of flows** — Shell and primitives first; pages adopt incrementally.

## Source of truth (implementation)

| Layer | Location |
|--------|-----------|
| CSS variables | `app/globals.css` (`:root`) |
| Font faces | `app/globals.css` (`@import` Google Fonts — browser/runtime load; avoids compile-time fetch) |
| Layout shell | `app/layout.tsx` |
| UI primitives | `components/ui/*` |
| Class helpers | `lib/design/cn.ts` |

## Type scale (semantic)

Uses CSS variables `--accl-text-*`; components may map to Tailwind via arbitrary values or future `@theme` expansion.

## Z-depth

`--accl-z-dropdown` through `--accl-z-toast` — use for future overlays; NavigationBar retains existing z-index until a dedicated phase.
