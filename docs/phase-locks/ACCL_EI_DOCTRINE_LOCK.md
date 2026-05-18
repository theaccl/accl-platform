# ACCL Emotional Intelligence Doctrine Lock Snapshot

**Status:** LOCKED (doctrine only — no implementation)  
**Locked:** 2026-05-18 (UTC)  
**Baseline role:** Preserve EI architectural containment and anti-patterns before any EI build phase.

**Prerequisite platform locks (unchanged):** Phase 1E–1H (move logs, idempotency, composite bot RPC, `bot_settings`).

---

## 1) Lock purpose

- Preserve EI as **doctrine / specification only**
- Prevent accidental implementation of EI runtime, data, or authority paths
- Anchor the rule: **EI is modifier infrastructure, not authority infrastructure**
- Record forbidden anti-pattern: **Single-Event Emotional Inference**

---

## 2) DO NOT BUILD YET

| Category | Added in this lock? | Status |
|----------|---------------------|--------|
| Runtime EI logic | No | **Not authorized** |
| Database schema (EI tables/columns) | No | **Not authorized** |
| APIs (EI routes/webhooks) | No | **Not authorized** |
| UI surfaces (EI panels, mood UX) | No | **Not authorized** |
| Model integrations (LLM emotion classifiers) | No | **Not authorized** |
| Enforcement behavior (EI → anti-cheat) | No | **Not authorized** |

**Confirmation:** This lock adds **documentation only**. No EI executable code, migrations, or product surfaces were introduced.

---

## 3) Doctrine artifacts

| Artifact | Path |
|----------|------|
| Primary doctrine | `docs/doctrine/ACCL_EMOTIONAL_INTELLIGENCE_DOCTRINE.md` |
| This lock snapshot | `docs/phase-locks/ACCL_EI_DOCTRINE_LOCK.md` |
| Integrity cross-reference | `docs/security/ACCL_9_LAYER_ANTI_CHEAT_ARCHITECTURE.md` (related-docs entry added) |

---

## 4) Architectural confirmations (locked)

### Modifier-only, not authority

- [x] EI may modify: tone, pacing, silence, warmth, break suggestions
- [x] EI may **never** alter: chess truth, matchmaking, difficulty, ratings, commercial prompts, enforcement, competitive access

### Anti-pattern: Single-Event Emotional Inference

- [x] **Forbidden:** inferring emotional state from one isolated behavioral event and acting immediately
- [x] **Required pattern:** accumulated evidence, confidence scoring, signal corroboration, decay over time, proportional response thresholds
- [x] **Parallel documented:** Integrity Layer suspicion scoring (never convict from one signal)

### Containment principle

- [x] Documented: the critical diagram includes what the system is **structurally forbidden** from doing, not only what it can do

---

## 5) Cross-reference verification

- [x] `docs/security/ACCL_9_LAYER_ANTI_CHEAT_ARCHITECTURE.md` includes related-doc link to `docs/doctrine/ACCL_EMOTIONAL_INTELLIGENCE_DOCTRINE.md` with EI modifier-only + Single-Event Emotional Inference note

---

## 6) Explicit non-goals (remain out of scope)

- No EI implementation phase started
- No coupling of EI to `submit-move`, bot games, ratings, matchmaking, or analysis queue
- Phase 1I (when unlocked) is **bot_move_jobs queue only** — see `docs/plans/PHASE_1I_BOT_MOVE_JOBS_PLAN.md`

---

## 7) Unlock criteria (future EI phase — not active)

Before any EI build work:

1. Explicit product approval for EI scope and surfaces
2. New phase lock superseding this document
3. Threat model for single-event inference and authority bleed
4. Separation tests proving EI cannot call authority subsystems

Until then: **do not implement EI.**

---

*This file is the doctrine lock snapshot for ACCL Emotional Intelligence. Treat it as the baseline before any EI implementation.*
