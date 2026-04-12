# Manus Controlled Extraction (No Rewrite)

This pass treats Manus material as a **partial reference only**.
The current ACCL implementation remains the source of truth.

## Fixed architecture guardrails

- Keep free play and tournament flow structurally separate.
- Keep request intent rows (`match_requests`) separate from game rows (`games`).
- Keep startup semantics: row exists != game started; timing starts on first persisted move.
- Keep finished games as immutable history/replay records.
- Keep rated and unrated free play distinct.
- Keep tournament rating deferred to bracket milestones.
- Keep deterministic, data-driven tournament bracket progression.
- Keep correspondence mode supported.

## Manus extraction policy used in this pass

- Keep only structural ideas that improve clarity (organization, naming, docs).
- Rewrite any imported concept so it fits ACCL invariants before adoption.
- Reject assumptions that conflict with ACCL laws.
- Prefer docs/test organization over runtime logic edits.

## Explicitly rejected Manus assumptions

- 8-bucket bullet/blitz/rapid/daily model.
- Any attempt to remove correspondence.
- Flat-Elo simplifications.
- Blended free/tournament queue or lifecycle models.
- Any change that weakens finished-history or bracket integrity.

## Integration result in this pass

- Added documentation-only scaffolding to make guardrails explicit.
- Added validation map to point to existing tests around the invariants.
- No gameplay, timing, rating, queueing, or tournament runtime logic changed.
