# Tournament operator runbook — Phase 1 controlled ops

**Audience:** Moderators / operators running **small real-user** single-elimination tournaments.  
**Authoritative verification map:** [PHASE_1_FREEZE_AUDIT.md](../phase-locks/PHASE_1_FREEZE_AUDIT.md)  
**Quick boundaries:** [KNOWN_PHASE1_BOUNDARIES.md](./KNOWN_PHASE1_BOUNDARIES.md)  
**Tester handout:** [TESTER_ONBOARDING_CHECKLIST.md](./TESTER_ONBOARDING_CHECKLIST.md)

**Phase 1 policy:** Manual ops first. No auto-forfeit, no Swiss, no bracket bots, no payout automation in this runbook.

---

## 1. Operator prerequisites

| Item | Requirement |
|------|-------------|
| Access | Supabase SQL editor **or** local `.env.local` with `SUPABASE_SERVICE_ROLE_KEY` |
| HTTP ops (optional) | `ACCL_TOURNAMENT_OPS_SECRET` (≥16 chars), header `x-accl-tournament-ops-secret`, app running at `ACCL_BASE_URL` |
| Pre-flight verify | `npm run verify:phase-1-tournament-freeze` (all green on target DB) |
| Migrations | Through tournament hardening slices; if using `starts_at`: `20260519165000_tournament_starts_at_additive.sql` applied |
| Entrants | Distinct profile UUIDs; power-of-two count for clean KO (4 or 8 for first pilots) |

---

## 2. Tournament creation checklist

Use this **once per event** before announcing to testers.

### 2.1 Plan

- [ ] Format: **single_elimination** only  
- [ ] Size: **4** or **8** players (first pilots)  
- [ ] Ecosystem: `adult` or `k12` (K12 requires auth for hub visibility)  
- [ ] Tempo: `live` + `live_time_control` (e.g. `3+2`, `5+0`)  
- [ ] Start model: operator go-time (optional: set `starts_at` UTC for **display only** — not auto-enforced)  
- [ ] No-show policy: manual award after grace (2–5 min real; no product timer)  

### 2.2 Create event (HTTP ops path)

Header on every request: `x-accl-tournament-ops-secret: <ACCL_TOURNAMENT_OPS_SECRET>`

| Step | Endpoint | Body highlights |
|------|----------|-----------------|
| 1 | `POST /api/internal/tournaments/create` | `status: pending`, `format: single_elimination`, `tempo`, `ecosystem_scope`, `rated` |
| 2 | `POST /api/internal/tournaments/add-entrants` | `tournament_id`, `user_ids[]` — **before any matches** |
| 3 | *(Optional)* SQL or future UI | Set `tournaments.starts_at` if migration applied |
| 4 | Announce registration | Share `/tournaments/{id}`; testers join via `POST /api/tournaments/join` if enabled |

**Gate:** No `tournament_matches` rows until bootstrap. Adding entrants after matches exist returns **409**.

### 2.3 Seed order (before bootstrap)

Record entrant order **best → worst** (seed 1 = strongest). This order is the `ordered_user_ids` permutation for bootstrap.

- [ ] Apply seeds on `tournament_entries.seed` (1..N) if your ops path supports it  
- [ ] Verify entrant count = 4 or 8  

### 2.4 Go live — bootstrap bracket

| Step | Action |
|------|--------|
| 1 | `POST /api/internal/tournaments/bootstrap-bracket` with `tournament_id` + `ordered_user_ids` (exact permutation) |
| 2 | Confirm `tournaments.status` → `active` |
| 3 | Confirm R1: every paired match has `game_id` (4P → 2 games; 8P → 4 games) |
| 4 | Post game links to players: `/game/{gameId}` |

**Do not** call bootstrap twice expecting a reset — second call is idempotent (no duplicate games) but does not fix a bad first bracket. See § Rollback.

### 2.5 Post-bootstrap verification

- [ ] Open hub `/tournaments/{id}` as creator — bracket + match statuses  
- [ ] Spot-check one `games` row: `play_context=tournament`, `tournament_id` matches event  
- [ ] Share [TESTER_ONBOARDING_CHECKLIST.md](./TESTER_ONBOARDING_CHECKLIST.md)  

---

## 3. During the event (operator watch)

| Check | Frequency |
|-------|-----------|
| Hub snapshot refresh | Between rounds (browser reload) |
| Stuck `In progress` with one player absent | Per match — see § Manual no-show |
| Wrong `tournament_id` on a game | Rare — stop event if seen |
| Parallel second event | Allowed if isolated; verify champions separately |

**Match status chips (hub):**

| Chip | Meaning |
|------|---------|
| Waiting | Opponent slot not filled yet |
| Ready | Players set, board not spawned |
| In progress | `game_id` exists, game `active`/`waiting` |
| Resolved | `winner_id` set on match |

Live **FEN/clocks** are on `/game/{id}`, not the hub.

---

## 4. Manual no-show handling

**When:** One player is present, opponent never joins or abandons without finishing.

### 4.1 Policy (MVP)

1. Short grace (operator judgment; 2–5 minutes typical).  
2. Confirm absent player’s game is still `active`.  
3. Award win to **present** player via service role — **not** by asking present player to resign.

### 4.2 SQL (service role)

```sql
-- 1) Inspect
select id, white_player_id, black_player_id, status, tournament_id
from public.games where id = '<game_id>';

-- 2) Award present player (example: present is white)
select public.finish_game_system(
  '<game_id>'::uuid,
  'white_win',   -- or black_win
  'timeout'      -- allow-listed: timeout, resign, checkmate, ... — NOT forfeit/no_show
);

-- 3) Confirm propagation
select id, round_number, winner_id, game_id
from public.tournament_matches
where tournament_id = '<tournament_id>'
order by round_number, match_number;
```

### 4.3 Do not

| Action | Why |
|--------|-----|
| Ask **present** player to **resign** | Resign gives win to **absent** player |
| Use `draw` | No advancement |
| Use `forfeit` / `no_show` as `end_reason` | DB constraint rejects |
| Auto-forfeit | Not implemented — deferred |

**Verify reference:** `npm run verify:tournament-noshow-ops`

---

## 5. Recovery procedure (interrupted / partial round)

**When:** Browser refresh, operator disconnect, one semifinal finished and one still live, or stalled round.

| Situation | Procedure |
|-----------|-----------|
| **Partial round** | Normal — finish remaining R1 games; final spawns only when **both** R1 winners exist |
| **Stuck active game** | § Manual no-show or wait for players |
| **Re-bootstrap same event** | Safe if `game_id` already set — idempotent; **does not** replace bad bracket |
| **Hub looks wrong after refresh** | Reload hub; trust DB over stale UI |
| **Free play during event** | Allowed for testers; must not mutate bracket (isolation verified) |

**Operator sequence (partial R1):**

1. Confirm one R1 `winner_id` set, sibling R1 still `active`.  
2. Do **not** expect final `game_id` until second R1 completes.  
3. Finish second R1 (play or manual no-show).  
4. Confirm final match has `game_id` + both players.  
5. Finish final → `tournaments.status = completed`.

**Verify reference:** `npm run verify:tournament-recovery`

---

## 6. Spectator + reconnect (operator communication)

Tell spectators:

- Use `/game/{gameId}?spectate=1` (required for logged-in non-players).  
- Refresh if finish banner lags after game ends.  
- They cannot move pieces or claim seats from spectate URL.

Tell players:

- Refresh if board stale; same `game_id` should restore state.  
- Tournament reminder in free lobby is **warning only**.

**Verify reference:** `npm run verify:tournament-spectator-reconnect`

---

## 7. Completing the event

- [ ] Final match `winner_id` set  
- [ ] `tournaments.status = completed`  
- [ ] Hub shows champion (derived from final match — see standings slice)  
- [ ] Record champion UUID externally for prizes (no in-app payout automation)  
- [ ] Trophy issuance: `emit_trophy_for_tournament_champion` exists in DB — **not** part of Phase 1 verification; treat as best-effort / manual follow-up  

**Verify reference:** `npm run verify:tournament-standings-champion`

---

## 8. Rollback if tournament becomes corrupted

**Stop the event** — ask players not to continue on broken boards.

### 8.1 When to rollback

| Symptom | Likely corruption |
|---------|-------------------|
| Duplicate `game_id` for same match | Re-bootstrap / manual SQL error |
| Wrong player in final | Bad `ordered_user_ids` at bootstrap |
| `tournament_advance_invariant_violation` | Bracket linkage broken |
| Matches exist while `pending` | Half-written persist |
| Event stuck `active` after final finished | Missing `winner_id` / trigger issue |

### 8.2 Safe rollback (test / pilot DB only)

**Only** when abandoning the event — destructive.

```sql
-- Replace <tid> with tournament id. Deletes games linked to matches, then bracket.
delete from public.games
where id in (
  select game_id from public.tournament_matches
  where tournament_id = '<tid>' and game_id is not null
);

delete from public.tournament_matches where tournament_id = '<tid>';
delete from public.tournament_entries where tournament_id = '<tid>';
delete from public.tournaments where id = '<tid>';
```

Recreate from § Tournament creation checklist if the pilot continues.

### 8.3 Non-destructive repair (expert only)

| Issue | Careful action |
|-------|----------------|
| Stuck `active` after decisive final | Inspect final `games.status`, `winner_id`, `result`; one corrective `finish_game_system` if needed |
| Half-written pending+matches | Delete matches + set `pending`, or full rollback |
| Wrong bootstrap order | **Rollback** — do not re-bootstrap over wrong winners |

**Never** casually edit `advance_winner_as` or `next_match_id` without engineering review.

---

## 9. Multi-event operations

- [ ] Use separate tournament UUIDs per event  
- [ ] Never reuse game links across events  
- [ ] Completing event A must not change event B’s hub  
- [ ] Champions are per-event only  

**Verify reference:** `npm run verify:tournament-multi-concurrency`

---

## 10. Bug reporting intake (operator)

Testers submit via app → `tester_bug_reports`.

| Category | Use for |
|----------|---------|
| `match_issue` | Board, clock, wrong result, bracket |
| `ui_issue` | Hub, links, display |
| `confusion` | Process / copy unclear |
| `cheating_concern` | Fair play suspicion |
| `bug` | General defect |
| `other` | Fallback |

**Operator triage template:**

1. Tournament id + game id + user id  
2. Time (UTC) + category  
3. DB spot-check: `games.status`, `tournament_matches.winner_id`, `tournaments.status`  
4. Classify: boundary (expected Phase 1) vs defect (engineering) using [KNOWN_PHASE1_BOUNDARIES.md](./KNOWN_PHASE1_BOUNDARIES.md)  
5. If defect on bracket authority → freeze changes; file engineering ticket with `npm run verify:phase-1-tournament-freeze` output  

---

## 11. Scheduled start (optional)

| Fact | Ops implication |
|------|-----------------|
| `starts_at` is stored | Can set via SQL for comms |
| **Not enforced** | You must still call bootstrap at go-time |
| Grace | Operator-defined; not a system timer |

**Verify reference:** `npm run verify:tournament-scheduled-start-noshow`

---

## 12. Pre-pilot and post-incident verify commands

| Command | Proves |
|---------|--------|
| `npm run verify:phase-1-tournament-freeze` | Full Phase 1 tournament hardening regression |
| `npm run verify:tournament-4p-ko` | Happy-path 4P |
| `npm run verify:tournament-8p-ko` | Happy-path 8P |
| `npm run verify:tournament-noshow-ops` | Manual award path |
| `npm run verify:tournament-recovery` | Partial round + idempotent bootstrap |
| `npm run verify:tournament-multi-concurrency` | Parallel events |
| `npm run verify:tournament-standings-champion` | Hub read-model phases |

---

## 13. Related phase-locks

| Doc | Topic |
|-----|--------|
| [PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md](../phase-locks/PHASE_1_TOURNAMENT_4P_KO_VERIFICATION.md) | 4P flow |
| [PHASE_1_TOURNAMENT_8P_KO_VERIFICATION.md](../phase-locks/PHASE_1_TOURNAMENT_8P_KO_VERIFICATION.md) | 8P flow |
| [PHASE_1_TOURNAMENT_NOSHOW_OPS.md](../phase-locks/PHASE_1_TOURNAMENT_NOSHOW_OPS.md) | No-show SQL detail |
| [PHASE_1_TOURNAMENT_RECOVERY.md](../phase-locks/PHASE_1_TOURNAMENT_RECOVERY.md) | Recovery verification |
| [PHASE_1_TOURNAMENT_SPECTATOR_RECONNECT.md](../phase-locks/PHASE_1_TOURNAMENT_SPECTATOR_RECONNECT.md) | Spectator boundaries |
| [PHASE_1_TOURNAMENT_FREEPLAY_COEXISTENCE.md](../phase-locks/PHASE_1_TOURNAMENT_FREEPLAY_COEXISTENCE.md) | Free-play isolation |
| [PHASE_1_FREEZE_AUDIT.md](../phase-locks/PHASE_1_FREEZE_AUDIT.md) | Freeze classification |

---

## 14. Out of scope for operators (do not promise)

Swiss, bracket bots, auto-forfeit, check-in app, payout automation, custom starting positions, realtime overhauls, new spectator features, trophy product changes without engineering sign-off.
