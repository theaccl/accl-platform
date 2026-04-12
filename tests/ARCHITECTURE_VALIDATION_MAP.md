# ACCL Architecture Validation Map

This file maps core architecture invariants to existing tests.
It is intended as a controlled extraction aid: improve structure, not runtime behavior.

## Free-play truth and requests/game separation

- Requests are intent, not games:
  - `tests/functional/direct-challenge-no-premature-game.spec.ts`
  - `tests/functional/direct-challenge.spec.ts`
- Open-seat lifecycle and pairing:
  - `tests/functional/queue-match-free.spec.ts`
  - `tests/functional/free-play-validation.spec.ts`
  - `tests/unit/freePlayLobby.spec.ts`

## Timing and board interaction integrity

- No solo start / no early clock start:
  - `tests/regression/no-solo-start.spec.ts`
  - `tests/regression/no-early-clock-start.spec.ts`
  - `tests/unit/gameTiming.spec.ts`
- Move/board interaction guardrails:
  - `tests/unit/boardInteraction.spec.ts`
  - `tests/functional/first-move-sync.spec.ts`
  - `tests/gameplay/move_sync.spec.ts`

## Finished-game and history truth

- Finished-state semantics and labels:
  - `tests/unit/finishedGame.spec.ts`
  - `tests/functional/end-state-resign.spec.ts`
  - `tests/functional/draw-agreement.spec.ts`
  - `tests/functional/terminal-finish-checkmate.spec.ts`
- History/replay preservation:
  - `tests/gameplay/history_preservation.spec.ts`
  - `tests/helpers/historyPreservation.ts`

## Rated vs unrated and rating routing

- Free rated/unrated behavior:
  - `tests/free_play/rating_mutation.spec.ts`
  - `tests/unit/gameRated.spec.ts`
- Rating classification/deferred tournament behavior:
  - `tests/unit/ratingClassification.spec.ts`
  - `tests/unit/tournamentFoundation.spec.ts` (deferred bracket timing checks)

## Tournament bracket integrity

- Deterministic bracket generation + advancement idempotency:
  - `tests/unit/tournamentFoundation.spec.ts`

## Architecture drift tripwires

- Fixed rating bucket namespace / no speed-class bucket reintroduction:
  - `tests/unit/architectureEnforcement.spec.ts`
- Finished row never treated as active/waiting/open-seat in lobby surfaces:
  - `tests/unit/architectureEnforcement.spec.ts`
- Tournament-rated games remain deferred (not immediate free-play updates):
  - `tests/unit/architectureEnforcement.spec.ts`

## Extraction rule of thumb

If a Manus concept does not preserve these invariants and their validating tests,
it should be rewritten first or rejected.
