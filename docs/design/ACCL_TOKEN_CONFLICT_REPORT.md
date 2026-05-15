# ACCL token reconciliation — conflict report (reference v0.1 vs `app/globals.css`)

**Status:** For human sign-off on value divergences before any palette re-tune.  
**Canonical vocabulary:** `--accl-*` and `--font-accl-*` in `app/globals.css` only. The external reference file must not be imported.

---

## 1. Inventory — `app/globals.css` custom properties (`:root`)

### Fonts

| Token |
|-------|
| `--font-accl-display`, `--font-accl-ui`, `--font-accl-mono` |

### Surfaces / backgrounds

| Token |
|-------|
| `--accl-bg-base`, `--accl-bg-arena`, `--accl-bg-elevated`, `--accl-bg-card`, `--accl-bg-card-end`, `--accl-bg-game`, `--accl-bg-popover` |

### Borders

| Token |
|-------|
| `--accl-border-subtle`, `--accl-border-muted`, `--accl-border-strong`, `--accl-border-accent` |

### Text

| Token |
|-------|
| `--accl-text-primary`, `--accl-text-secondary`, `--accl-text-muted`, `--accl-text-faint` |

### Accents

| Token |
|-------|
| `--accl-accent-crimson`, `--accl-accent-crimson-bright`, `--accl-accent-gold`, `--accl-accent-amber` |

### Status (UI semantics)

| Token |
|-------|
| `--accl-status-success`, `--accl-status-success-muted`, `--accl-status-warning`, `--accl-status-warning-muted`, `--accl-status-danger`, `--accl-status-danger-muted`, `--accl-status-info`, `--accl-status-info-muted`, `--accl-status-neutral`, `--accl-status-neutral-muted` |

### Spacing

| Token |
|-------|
| `--accl-space-0` … `--accl-space-12` (rem scale) |

### Radius

| Token |
|-------|
| `--accl-radius-sm` … `--accl-radius-2xl`, `--accl-radius-pill` |

### Typography scale

| Token |
|-------|
| `--accl-text-2xs` … `--accl-text-3xl`, `--accl-text-display`, `--accl-leading-*`, `--accl-tracking-wide/wider/caps` |

### Shadow

| Token |
|-------|
| `--accl-shadow-card`, `--accl-shadow-card-hover`, `--accl-shadow-panel`, `--accl-shadow-modal`, `--accl-shadow-popover`, `--accl-shadow-piece` |

### Z-index

| Token |
|-------|
| `--accl-z-base`, `--accl-z-raised`, `--accl-z-dropdown`, `--accl-z-sticky`, `--accl-z-overlay`, `--accl-z-modal`, `--accl-z-toast`, `--accl-z-board`, `--accl-z-notification` |

### Palette / semantic aliases (reference reconciliation layer)

| Token |
|-------|
| `--accl-palette-*`, `--accl-surface-*`, `--accl-border-default/hover`, `--accl-border-prestige`, `--accl-border-danger`, `--accl-border-pending`, `--accl-border-trainer`, `--accl-text-tertiary`, `--accl-text-prestige`, `--accl-text-on-prestige`, `--accl-text-inverse`, `--accl-text-success`, `--accl-text-pending`, `--accl-text-trainer`, `--accl-text-danger-display` |
| `--accl-status-online`, `--accl-status-pending`, `--accl-status-in-game`, `--accl-status-offline`, `--accl-status-danger-semantic`, `--accl-status-active` |
| `--accl-accent-prestige`, `--accl-accent-prestige-soft`, `--accl-accent-pressure`, `--accl-accent-pressure-bright`, `--accl-accent-enforcement`, `--accl-accent-trainer`, `--accl-accent-trainer-soft` |
| `--accl-focus-ring`, `--accl-focus-ring-width`, `--accl-focus-ring-offset` |
| `--accl-font-weight-*`, `--accl-tracking-tight/display/mono`, `--accl-leading-loose` |
| `--accl-duration-*`, `--accl-ease-*`, `--accl-transition-hover`, `--accl-transition-fade`, `--accl-transition-page-enter`, `--accl-duration-pulse`, `--accl-duration-shell` |
| `--accl-elevation-*`, `--accl-card-padding*`, `--accl-card-gap`, `--accl-section-gap`, `--accl-inline-gap`, `--accl-badge-padding-*`, `--accl-grid-max-width` |

### Tailwind / Next bridge

| Token |
|-------|
| `--background`, `--foreground` |
| `@theme inline`: `--color-background`, `--color-foreground`, `--font-sans`, `--font-mono`, `--font-display` |

---

## 2. Mapping — reference proposal → canonical `--accl-*`

| Reference (concept) | Canonical token(s) | Report category |
|---------------------|--------------------|-----------------|
| `--color-abyss` / `--surface-page` | `--accl-bg-base`, `--accl-surface-page` → same | **Exact** (role); hex differs from ref `#0D0F14` → see conflicts |
| `--color-deep-panel` / panel surface | `--accl-bg-elevated`, `--accl-surface-panel` | **Near** (live `#0f1724` vs ref `#13161E`) |
| `--color-mid-panel` | `--accl-bg-card` | **Near** |
| `--color-elevated-panel` / modal | `--accl-bg-card-end`, `--accl-surface-modal` | **Near** |
| `--color-popover` | `--accl-bg-popover` (canonical primitive) | **Exact** to ref hex when adopted |
| Board/grid border hues | `--accl-border-muted`, `--accl-border-strong`, `--accl-palette-board-line/grid-line` | **Exact** (aliases) |
| Text ivory/stone/slate | `--accl-text-primary/secondary/faint` + `--accl-text-muted` | **Near** (Tailwind-ish neutrals vs warm ivory) |
| Gold / brass | `--accl-accent-gold`, `--accl-accent-prestige-soft` | **Near** |
| Crimson / blood red | `--accl-accent-crimson`, `--accl-accent-crimson-bright` | **Near** |
| Trainer cyan / steel | `--accl-palette-trainer-cyan/steel`, accents | **Exact** hex to ref |
| Online / success green | `--accl-status-success`, `--accl-status-online` | **Near** (`#22c55e` vs ref `#3AAD6E`) |
| Pending amber | `--accl-status-warning`, `--accl-accent-amber`, `--accl-status-pending` | **Near** |
| Graphite offline | `--accl-palette-graphite`; role `--accl-status-offline` → `--accl-status-neutral` today | **Conflict** — see below |
| Status roles Art. 4 | `--accl-status-online` … | **Exact** (indirection); values **near** ref |
| Enforcement → crimson | `--accl-accent-enforcement` → `--accl-accent-crimson` | **New alias** (name only) |
| Focus ring | `--accl-focus-ring` | **Exact** (gold) |
| Font families | `--font-accl-*` | **Exact** (families match; weights in import differ slightly) |
| Type scale (px) | `--accl-text-*` rem + clamp display | **Near** (different system) |
| Spacing 4–64px | `--accl-space-*` rem | **Exact** role, **near** if interpreted as px |
| `--shadow-modal/popover` | `--accl-shadow-modal/popover` | **Exact** |
| `--shadow-piece` | `--accl-shadow-piece` | **New** (optional) |
| Radii (pill 2px ref) | `--accl-radius-pill` = `9999px` | **Conflict** — intentional product choice |
| Motion durations | `--accl-duration-*` + extended deliberate/ceremony/breathing | **Exact** names adapted; values aligned to ref where added |
| Z-index 100–600 ref | `--accl-z-*` lower numbers | **Conflict** — defer restack; document |
| K–12 theme | `[data-theme="scholastic"]` overrides | **Exact** (pattern) |
| `prefers-reduced-motion` | collapses `--accl-duration-*` | **Exact** |

---

## 3. Conflict report (sign-off required before changing hex / z-index / radii)

### 3.1 Near match — values differ; live app is source of truth until approved

| Area | Reference | Current canonical | Notes |
|------|-----------|-------------------|--------|
| Page background | `#0D0F14` | `--accl-bg-base` `#0d1117` | Darker / slightly different hue |
| Panel stack | `#13161E` / `#1A1E28` / `#1F2333` | elevated/card/card-end | Whole stack shifted vs GitHub-adjacent palette |
| Primary text | `#EDE8DC` | `#f4f4f5` | Ref warmer “ivory” |
| Gold | `#C9A84C` | `#d4a017` | Live more saturated |
| Online green | `#3AAD6E` | `#22c55e` | Live is tailwind green |
| Pending | `#C4862A` / honey | `#eab308` / `#f59e0b` | Live yellow-amber family |
| Danger text | `#C0392B` | `#ef4444` | Live brighter red |
| “Offline” graphite | `#3A3E50` | `--accl-status-offline` → `#64748b` | **Semantic lock vs implementation** |

### 3.2 Genuinely new in reference — adopted only as `--accl-*` aliases (no second naming scheme)

- Brass / prestige-soft tone → `--accl-accent-prestige-soft`
- Enforcement label → `--accl-accent-enforcement`
- Popover as first-class bg → `--accl-bg-popover`
- Piece lift shadow → `--accl-shadow-piece`
- Longer motion tokens → `--accl-duration-deliberate`, `--accl-duration-ceremony`, `--accl-duration-breathing`
- Extra easings / transition presets → `--accl-ease-pulse`, `--accl-ease-linear`, `--accl-transition-fade`, `--accl-transition-page-enter`
- Border role tokens → `--accl-border-prestige`, `--accl-border-danger`, `--accl-border-pending`, `--accl-border-trainer`
- Text role tokens → `--accl-text-success`, `--accl-text-pending`, `--accl-text-trainer`, `--accl-text-danger-display` (vivid danger copy; `--accl-status-danger-semantic` remains the status slot)

### 3.3 Should defer (do not change without design + QA pass)

- **Z-index scale:** reference uses 200/400/500/600; app uses 50/100/150/200/300. Restacking risks modal/overlay bugs.
- **Pill radius:** reference `2px`; app `9999px` for capsule pills — product decision.
- **Offline color:** point `--accl-status-offline` at graphite vs slate-neutral changes many implied states; needs sign-off.
- **Breakpoint tokens:** documentation-only; keep media queries as today.
- **IBM Plex / Bebas fallbacks:** not required for current stack.
- **Grid gutter / sidebar width / mobile margin:** layout constants; add when layout system consumes tokens.

---

## 4. Single-vocabulary rule

- **`--accl-palette-*`:** hue labels that **resolve only through** `--accl-bg-*`, `--accl-border-*`, or documented literals (e.g. trainer pair) — no duplicate hex for the same role as a primitive.
- **`--accl-surface-*` / `--accl-elevation-*`:** thin aliases over primitives for readability and Article alignment, not parallel palettes.
- **Components:** should prefer `--accl-bg-*`, `--accl-text-*`, `--accl-status-*`, and semantic role tokens above; avoid hard-coded hex.

---

## 5. Sign-off checklist

- [ ] Approve keeping current neutrals/greens/amber vs reference “constitution” hexes
- [ ] Decide offline: neutral slate (`#64748b`) vs graphite (`#3a3e50`)
- [ ] Decide if/when to realign z-index to reference scale
- [ ] Decide scholastic body size strategy (ref: 15px body; app: 16px root + 15px mobile)
