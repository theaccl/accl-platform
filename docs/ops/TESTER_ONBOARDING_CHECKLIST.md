# Tester onboarding — controlled tournament pilot

**Audience:** Trusted testers in a **small real-user** tournament pilot.  
**Ops authority:** [TOURNAMENT_OPERATOR_RUNBOOK.md](./TOURNAMENT_OPERATOR_RUNBOOK.md)  
**Boundaries:** [KNOWN_PHASE1_BOUNDARIES.md](./KNOWN_PHASE1_BOUNDARIES.md)  
**Freeze reference:** [PHASE_1_FREEZE_AUDIT.md](../phase-locks/PHASE_1_FREEZE_AUDIT.md)

---

## Before you start

- [ ] You have an ACCL account (adult ecosystem unless event is K12 — K12 events require sign-in).
- [ ] You know your **display username** and can open your profile.
- [ ] You are on a **desktop or mobile browser** with a stable connection (refresh is normal if the board looks stale).
- [ ] You understand this pilot is **single-elimination KO only** — not Swiss, not automated prizes in-app.

---

## What you will do

| Role | Actions |
|------|---------|
| **Player** | Register for the event → open your tournament game link → play or wait for operator if opponent absent |
| **Spectator** (optional) | Open another player’s board with `?spectate=1` — watch only, no moves |
| **Free play** (optional) | You may still use lobby/free games; a **reminder** may appear if you have an active tournament board |

---

## Registration

- [ ] Operator shares the tournament hub URL: `/tournaments/{tournamentId}`.
- [ ] Join while status is **Pending** (if join is open for your event).
- [ ] Confirm you appear in the entrant list (creator/participants can see pending lists; public may not).
- [ ] Do **not** expect the bracket until the operator **bootstraps** after go-time.

---

## When the event goes live (`Active`)

- [ ] Refresh the tournament hub — you should see **matches** and board links.
- [ ] Open **your** game from the hub or direct link: `/game/{gameId}` (no `?spectate=1` if you are seated).
- [ ] Confirm you see **your color** and clocks (live tempo).
- [ ] If you are **not** in the game, use spectate only: `/game/{gameId}?spectate=1`.

---

## Playing your game

- [ ] Play moves normally on your board.
- [ ] If the page freezes, **refresh** — your game should reload from the server (same game id).
- [ ] **Resign** only if you intend to lose — resign awards the **opponent**, not you.
- [ ] If your opponent never appears, **stop** — do not resign to “fix” it. Notify the operator (Discord/runbook channel). The operator awards the win to the present player.

---

## Spectating

- [ ] Always use: `/game/{gameId}?spectate=1`
- [ ] Expect **no** move controls and no engine analysis on the public spectate path.
- [ ] If the game ended but the page still looks live, **refresh** or switch away and back to the tab.

---

## After your match

- [ ] If you won, wait for the next round — hub should show a new match when the operator/advancement catches up.
- [ ] If you lost, your run in this event is over unless the operator says otherwise.
- [ ] When the event is **Completed**, the hub should show a **champion** (final winner).

---

## Free play during a tournament

- [ ] You **may** open Nexus, lobby, or daily games.
- [ ] Read any **tournament coexistence reminder** — it is advisory, not a hard block.
- [ ] Do **not** try to join a tournament board as if it were a free open seat.

---

## Bug reporting (required when something breaks)

Use the in-app **tester bug report** (`POST /api/tester/bug-report`).

| Field | What to include |
|-------|-----------------|
| **Category** | `match_issue` for board/bracket; `ui_issue` for display; `confusion` for unclear flow |
| **Body** | What you expected vs what happened; time (UTC); tournament name |
| **Route** | Auto-captured — or paste `/tournaments/...` or `/game/...` |
| **Attach game** | Enable when reporting a **specific board** |

Categories: `bug`, `confusion`, `match_issue`, `ui_issue`, `cheating_concern`, `other`.

**Do not** put passwords or payment details in the report.

---

## What not to test in this pilot

- Swiss or round-robin formats  
- Automated forfeits or “I was here” check-in  
- Payout / prize claims inside the app  
- Custom starting positions / Opening Encyclopedia  
- Bot opponents in the tournament bracket  

---

## Quick help

| Problem | Try |
|---------|-----|
| “Can’t load tournament” | Wrong ecosystem account, or pending event not visible to you — ask operator |
| “Can’t move pieces” | You are on spectate URL, wrong account, or not your turn |
| “Opponent absent” | Notify operator — do not resign |
| “Board outdated” | Refresh tab |
| “Champion missing” | Event may still be `active`, or final not finished — ask operator |

---

## Operator escalation

If the bracket looks wrong (duplicate games, wrong winner, stuck `active`), **stop playing** and ping the operator with:

1. Tournament id (UUID from URL)  
2. Match round / players  
3. Game id(s)  
4. Screenshot + bug report  

See runbook § Rollback and recovery.
