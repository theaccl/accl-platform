# Phase 1 — Known boundaries (quick reference)

**Authoritative source:** [PHASE_1_FREEZE_AUDIT.md](../phase-locks/PHASE_1_FREEZE_AUDIT.md) (`main` @ `6bb6bbe`+).

Use this page during live ops. It does **not** replace the runbook — it classifies what is safe, manual-only, deferred, or frozen.

---

## MVP scope (what we run)

| In scope | Out of scope |
|----------|----------------|
| Single-elimination **4P** and **8P** KO | Swiss |
| Live tempo tournaments | Payout automation |
| Manual operator resolution | Auto-forfeit / auto no-show |
| Standard chess start position | Opening Encyclopedia (audit only) |
| Parallel events (isolated `tournament_id`) | Tournament bots in bracket |
| Free-play + tournament coexistence (warn-only) | Realtime redesign |

---

## Remaining risks (do not assume otherwise)

| Risk | Reality today | Operator action |
|------|---------------|-----------------|
| **No auto no-show** | Absent player’s game stays `active` | Service-role `finish_game_system` → present player wins (`timeout` or `resign`) |
| **No check-in signal** | Cannot tell absent vs slow | Human judgment + short grace; then manual award |
| **`starts_at` not enforced** | Informational column only | Operator bootstraps bracket at go-time |
| **Standard FEN only** | SQL spawn hardcodes start position | Do not promise custom openings |
| **No Swiss** | KO bracket only | Do not run Swiss events |
| **No payouts** | Economics fields exist; automation not verified | Handle prizes outside app |
| **Trophy emitter** | DB function exists; not in Phase 1 verify | Do not rely on in-app trophy UX |
| **Spectator finish lag** | Polling stops when game `finished` | Tell spectators to refresh or refocus tab |
| **Hub snapshot not live FEN** | `/tournaments/[id]` is one-shot | Live board is `/game/{id}` |
| **Opening Encyclopedia** | Uncommitted audit doc | Not a product feature |

---

## Spectator + reconnect boundaries

| Situation | Rule |
|-----------|------|
| Logged-in spectator | URL **must** include `?spectate=1` on `/game/{gameId}` |
| Logged-out spectator | `?spectate=1` or `?public=1` |
| Move controls | Never available to spectators (`data-spectator-readonly`) |
| Move list for spectators | Comes from **spectate RPC** on each snapshot load, not direct `game_move_logs` RLS |
| Player refresh | `games` row is source of truth; reload should restore FEN/turn/clocks |
| After game ends | Spectator may need **refresh** to see finished banner |

**Verify slice:** `npm run verify:tournament-spectator-reconnect`

---

## Free-play coexistence boundaries

| Rule | Detail |
|------|--------|
| Tournament games | `play_context=tournament`, `tournament_id` set |
| Free busy slot | Only `play_context=free` and `tournament_id is null` |
| Lobby reminder | `TournamentCoexistenceNotice` — **informational only** |
| Wrong join path | Tournament game cannot be joined as free open seat |

**Verify slice:** `npm run verify:tournament-freeplay-coexistence`

---

## Multi-tournament boundaries

| Rule | Detail |
|------|--------|
| Isolation key | Every `games.tournament_id` must match its event |
| Advancement | Finishing event A must not change event B’s `tournament_matches` |
| Re-bootstrap | `tournament_bootstrap_round` is scoped to **one** `p_tournament_id` |
| Champion | Derived per event from **that** event’s final match only |

**Verify slice:** `npm run verify:tournament-multi-concurrency`

---

## Standings + champion boundaries

| State | Hub should show |
|-------|-----------------|
| `pending` | Entrants (insider/creator); no matches yet |
| `active` | Bracket, R1 boards, match chips (Waiting / Ready / Live / Resolved) |
| Partial round | Mix of Resolved + Live; final not live until both feeders done |
| `completed` | Champion = final match `winner_id` (UI derives via read model) |

**Verify slice:** `npm run verify:tournament-standings-champion`

---

## `finish_game_system` allow-list (critical)

| Allowed for no-show ops | **Rejected** |
|-------------------------|--------------|
| `timeout`, `resign`, `checkmate`, … | `forfeit`, `no_show` (DB check constraint) |

Advancement reads **`result` / `winner_id`**, not `end_reason` label.

---

## Do-not-touch (engineering)

Without a new phase-lock + full `npm run verify:phase-1-tournament-freeze`:

- Bracket SQL: `tournament_try_spawn_game`, `tournament_bootstrap_round`, `tournament_handle_finished_game`, `tournament_propagate_winner`
- `finish_game_system` + `games_end_reason_check`
- `persistTournamentBracket` / registration gate
- `buildTournamentSnapshot`, spectate RPCs
- Free-play busy / `create_seated_game_guard` tournament branch

---

## Re-verify before a live pilot

```bash
npm run verify:phase-1-tournament-freeze
```

Requires `.env.local` with Supabase service role and enough profile UUIDs (4 for 4P, 8 for multi / 8P).

---

## Phase-lock index

See [PHASE_1_FREEZE_AUDIT.md § Phase-lock index](../phase-locks/PHASE_1_FREEZE_AUDIT.md#phase-lock-index).
