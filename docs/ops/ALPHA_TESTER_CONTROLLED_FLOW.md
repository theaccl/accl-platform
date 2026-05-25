# Controlled alpha tester flow (Operation 8)

**Status:** Operator + Discord intake package for **controlled alpha testing** — not a public launch.  
**Production URL:** https://play.theaccl.com — do **not** send testers to old Vercel preview URLs (`accl-platform.vercel.app`).

**Locked tournament baseline (main):** `adf85e0` — 4P/8P KO, no-show/recovery, spectator/coexistence verifiers green.

**Related docs (authoritative detail):**

| Doc | Audience |
|-----|----------|
| [TESTER_LAUNCH_CHECKLIST.md](../TESTER_LAUNCH_CHECKLIST.md) | Operator pre-invite technical pass |
| [TESTER_ONBOARDING_CHECKLIST.md](./TESTER_ONBOARDING_CHECKLIST.md) | Testers in a **controlled tournament pilot** |
| [TRUSTED_TESTER_LIVE_SMOKE_TEST_PLAN.md](../TRUSTED_TESTER_LIVE_SMOKE_TEST_PLAN.md) | 2–5 person smoke before widening cohort |
| [TOURNAMENT_OPERATOR_RUNBOOK.md](./TOURNAMENT_OPERATOR_RUNBOOK.md) | Moderators — bracket, no-show, recovery |
| [KNOWN_PHASE1_BOUNDARIES.md](./KNOWN_PHASE1_BOUNDARIES.md) | Phase 1 limits (spectator, coexistence, no auto-forfeit) |
| [PHASE_1_FREEZE_AUDIT.md](../phase-locks/PHASE_1_FREEZE_AUDIT.md) | Engineering freeze / verify commands |

---

## Discord server setup (operator)

### Roles

| Role | Purpose |
|------|---------|
| **Owner** | Server config, role hierarchy, final escalation |
| **Moderator** | Run events, triage bugs, award no-shows, post announcements |
| **Tester** | Invited alpha testers only; no bracket authority |

Checklist:

- [ ] Roles created with clear names (Owner, Moderator, Tester)
- [ ] Moderators can manage messages in bug/known-issues channels
- [ ] Testers cannot post in `#announcements` (read-only for testers)
- [ ] `@everyone` does **not** have access to operator-only channels

### Channels

| Channel | Purpose |
|---------|---------|
| `#start-here` | One pinned link: play URL, login, this doc, bug format |
| `#announcements` | Operator-only posts; schedule, pauses, deploy notes |
| `#known-issues` | Curated list (mirror § Known issues below); update when fixed |
| `#bug-reports` | Tester paste + screenshot; moderator triage |
| `#testing-instructions` | Controlled test order + what not to test yet |
| `#general-feedback` | UX confusion, not security-critical bugs |

Permission notes (already applied in prior setup — verify before invite):

- [ ] `#announcements` — `@everyone`: **View Channel** + **Read Message History** allowed; **Send Messages** denied for testers
- [ ] `#known-issues` — same read-only pattern for `@everyone`
- [ ] `#bug-reports` — testers may post; moderators pin/close threads as needed

### First operator message (template)

> Welcome to the ACCL **controlled alpha**. This is not a public launch.  
> **Play at:** https://play.theaccl.com  
> Read `#start-here` and `#testing-instructions`. Report bugs in `#bug-reports` using the format in `#known-issues`.  
> Do **not** use engine assistance or analysis tools during **live** games.  
> Tournament events are **operator-led only** — wait for an announcement before joining a bracket.

---

## Integrity rules (all testers)

- **No engine / live-game assistance** — do not run Stockfish, browser extensions, or external analysis on positions while a live or tournament game is in progress. Post-game review on **finished** games only, where the product allows it.
- **No sharing access** — do not forward invites, credentials, or internal URLs outside the tester group unless staff approve.
- **Spectators are read-only** — use `/game/{gameId}?spectate=1`; do not expect move controls.
- **Report honestly** — include device, browser, account, and steps; screenshots help.

---

## Controlled testing order

Test in this order unless a moderator directs otherwise:

1. **Login → Profile** — sign in, claim username if prompted, open your profile
2. **Profile → NEXUS** — hub loads for signed-in user
3. **Play Computer** — start a bot game; confirm board loads
4. **Create / join free-play** — lobby or open seat; one live free game
5. **Resign / checkmate / PGN export** — finish a free game; confirm finished state
6. **Spectator watch** — open another user’s game with `?spectate=1`; confirm no move controls
7. **Bug report** — submit one test report via in-app tester bug report (or paste in `#bug-reports`)
8. **Controlled tournament** — **only when a moderator announces** a specific event and hub URL

Do **not** invite broad public testers. Expand cohort only after [TRUSTED_TESTER_LIVE_SMOKE_TEST_PLAN.md](../TRUSTED_TESTER_LIVE_SMOKE_TEST_PLAN.md) exit criteria.

---

## What to test first vs not yet

### Test now (controlled alpha)

- Auth, username onboarding, NEXUS, free play, Play Computer
- Spectate with `?spectate=1`
- Tester chat surfaces (mode chat, DMs) where enabled
- Bug report intake
- **Operator-led** single-elimination KO tournaments (4P or 8P) when announced

### Do not test yet (parked — report only if accidentally exposed)

- Swiss or round-robin tournaments
- Automated no-show / forfeit
- In-app payouts or prize claims
- Opening Encyclopedia / puzzle runtime / Trainer AI expansion
- Profile rating history charts (feature branch not merged)
- Nexus IA redesign
- Tournament bots in bracket
- Custom starting positions

---

## Known issues (share in `#known-issues`)

These are **expected in controlled alpha** — still report if they block you:

| Issue | What testers see | What to do |
|-------|------------------|------------|
| **Small illegal-move visual jump** | Board or notation may shift slightly on some illegal-move attempts (especially mobile) | Note device/browser; continue if playable |
| **Startup board layout / chrome not final** | Notation slot, banners, or spacing may change between builds | Report only if layout blocks play |
| **Spectator / player chat separation** | Player table chat vs spectator chat is still being watched; wrong channel or leakage should be reported | Screenshot + who could see what |
| **Open pairing card design** | Functional but not final visual design | UX feedback welcome; not a blocker |
| **Tournament testing is controlled** | Not public launch; brackets are operator-led KO only | Wait for moderator go-ahead |
| **Browser refresh / reconnect** | Refresh usually restores FEN/turn; edge cases possible | Report with game id + steps |
| **Spectator finish banner delay** | Finished game may look “live” until tab refresh or focus | Refresh; report if winner never appears |
| **Wrong production URL** | Old `accl-platform.vercel.app` links may be stale | Use **https://play.theaccl.com** only |

Tournament-specific boundaries (no-show, coexistence, spectate URL): [KNOWN_PHASE1_BOUNDARIES.md](./KNOWN_PHASE1_BOUNDARIES.md).

---

## Bug report format

Use in-app **Report issue** (tester bug report) and/or paste in `#bug-reports`:

| Field | Include |
|-------|---------|
| **What happened?** | Observed behavior |
| **What did you expect?** | Expected behavior |
| **Steps to reproduce** | Numbered steps |
| **Screenshot / video** | If possible |
| **Device / browser** | e.g. iPhone Safari, Windows Chrome |
| **Account username** | Your ACCL display username |
| **Game / tournament ID** | From URL if visible (`/game/...`, `/tournaments/...`) |
| **Time (UTC)** | When it occurred |
| **Role** | Player, spectator, or tester observing |

In-app categories: `bug`, `confusion`, `match_issue`, `ui_issue`, `cheating_concern`, `other`.

**Do not** include passwords or payment details.

---

## Contact / escalation flow

| Severity | Action |
|----------|--------|
| **Blocked** (cannot log in, blank page, cannot play at all) | `#bug-reports` + ping moderator; pause testing if widespread |
| **Match / bracket wrong** | Stop playing; tournament id + game id + screenshot → moderator ([TOURNAMENT_OPERATOR_RUNBOOK.md](./TOURNAMENT_OPERATOR_RUNBOOK.md)) |
| **Opponent no-show** | Do **not** resign to fix; notify moderator in event thread |
| **Confusion / UX** | `#general-feedback` or bug report category `confusion` |

Operator pre-invite technical pass: [TESTER_LAUNCH_CHECKLIST.md](../TESTER_LAUNCH_CHECKLIST.md).

Tournament pilot player steps: [TESTER_ONBOARDING_CHECKLIST.md](./TESTER_ONBOARDING_CHECKLIST.md).

---

## Operator re-verify before tournament invite

```bash
npm run verify:phase-1-tournament-freeze
```

Or individual slices: `verify:tournament-4p-ko`, `verify:tournament-8p-ko`, `verify:tournament-noshow-ops`, `verify:tournament-recovery`, `verify:tournament-spectator-reconnect`, `verify:tournament-freeplay-coexistence`.

Requires `.env.local` with Supabase service role.

---

## Document hygiene (internal)

When updating tester-facing copy, prefer editing **this file** + `#known-issues` pin first. Older docs that may still reference preview URLs:

- [STAGE_0_ALPHA_SNAPSHOT.md](../STAGE_0_ALPHA_SNAPSHOT.md) — historical; uses `accl-platform.vercel.app` for Stage 0 evidence only
- [KNOWN_PHASE1_BOUNDARIES.md](./KNOWN_PHASE1_BOUNDARIES.md) — update freeze SHA when locking new baselines

Testers should always receive **play.theaccl.com** and this controlled-flow summary.
