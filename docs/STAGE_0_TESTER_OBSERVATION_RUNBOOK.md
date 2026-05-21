# Stage 0 Alpha — Tester Observation Runbook

Controlled tester window for **`alpha-stage0-20260521`** (operational code at **`7c655fe`**).

**Purpose:** Observe real-user pressure on the frozen baseline — not expand scope.

**Related:** [STAGE_0_ALPHA_SNAPSHOT.md](./STAGE_0_ALPHA_SNAPSHOT.md)

---

## Freeze reference (do not change during window)

| Item | Value |
|------|--------|
| Production URL | https://accl-platform.vercel.app |
| Operational SHA | `7c655fe` |
| Tag | `alpha-stage0-20260521` → `7c655fe` (do **not** move) |
| Docs record on `main` | `6c93b06` (snapshot only; not deployed delta) |

---

## 1. Tester entry instructions

### Where to go

- Use **production only:** https://accl-platform.vercel.app  
- Do **not** use local dev, preview deploys, or old bookmarks unless ops explicitly assigns one.

### Expected path after login

1. **Login** → you should land on **`/profile`** (your public profile shell).
2. Open **NEXUS** (`/nexus`) — operational “your move” / active games hub.
3. Open **Free Play Lobby** (`/free`) — mode zones, obligations, links to mode rooms.

### Try first (≈30–45 min core path)

| Order | Flow | Entry |
|-------|------|--------|
| 1 | Play Computer | `/free/lobby/blitz` (or Bullet/Rapid) → Play Computer panel → start a bot game |
| 2 | Live 1v1 (open seat) | `/free/lobby/blitz` → **Create game** or **Find match** |
| 3 | Profile ↔ NEXUS | Switch between `/profile` and `/nexus` with a live game open |
| 4 | Direct challenge | `/free/play` → 5m challenge → opponent accepts on `/requests` |
| 5 | Reconnect | During a live game: refresh tab, use lobby “return to board” if shown |

### Avoid during alpha observation

- Requesting Swiss, new modes, AI mentor, trainer labs, or “can you add…”
- Running multiple accounts in one browser profile without ops guidance (stale state risk)
- Reporting cosmetic-only issues as blockers
- Expecting tournament bots, async bot queue changes, or deep reconnect “sovereignty” fixes
- Using `/trainer/computer` as the primary Play Computer path (sandbox; **live** Play Computer is in **free mode rooms**)

---

## 2. Controlled test checklist

Use this as a session script. Check **Pass / Fail / Skip** and log failures with the template in §3.

### A. Play Computer

- [ ] Open `/free/lobby/blitz` (or Bullet/Rapid)
- [ ] See Play Computer panel (`free-lobby-play-computer-panel`)
- [ ] Pick time control, start — lands on `/game/:id`
- [ ] Make at least one move; clock/board feel coherent
- [ ] Note any provisioning error text (`detail` shown)

### B. Live 1v1 (open pairing)

- [ ] On `/free/lobby/blitz`: **Create game** → open seat on board
- [ ] Second tester (or partner): **Find match** → joins same game
- [ ] Both seated, pre-first-move clocks behave (visible, not ticking before first move)
- [ ] Play at least one move each if possible

### C. Daily / async

- [ ] Open `/free/lobby/daily`
- [ ] Start or resume a daily/async game if available
- [ ] Confirm turn-based flow (no live clock confusion)

### D. Open pairing (hub)

- [ ] `/free` hub loads — obligations, mode zones, **Room →** links
- [ ] Filter by mode tab; open games list in mode room

### E. Direct challenge

- [ ] `/free/play` → set 5m, pick color, find opponent, send challenge
- [ ] Recipient: `/requests` → accept
- [ ] Both reach same `/game/:id`

### F. Spectator

- [ ] Open live game as third party: `/game/:id?spectate=1`
- [ ] Board visible; chat panels **not** shown to spectator (read-only observation)

### G. Chat (tester-enabled games)

- [ ] In a seated live game with tester chat: send one message
- [ ] Confirm send completes (not stuck on “Sending…”)

### H. Reconnect / refresh

- [ ] Mid-game: hard refresh (`Ctrl+R` / `Cmd+R`)
- [ ] Board and turn indicator recover
- [ ] Open `/free` or `/nexus` in second tab while game tab stays open — no crash/confusing duplicate obligations

### I. Profile → NEXUS navigation

- [ ] With active games: `/profile` loads identity shell
- [ ] `/nexus` shows operational games section
- [ ] Return to live game from hub links when it is your turn / your open seat

### J. Tournament (if ops provides event)

- [ ] Join or observe a **4-player KO**-style event if scheduled
- [ ] Watch bracket progression, board routing, first-move grace banner on KO boards
- [ ] Note anything that feels illegitimate (wrong pairing, stuck bracket, rating surprise)

---

## 3. Issue logging template

Copy per issue:

```markdown
### Issue ID: ST0-___

- **Tester:**
- **Device / browser:**
- **Time (timezone):**
- **Route / page:** (e.g. `/free/lobby/blitz`, `/game/…`)
- **Action taken:**
- **Expected:**
- **Actual:**
- **Screenshot / video:** (link or filename)
- **Reload fixed?** yes / no / partial
- **Repeated?** yes / no / intermittent
- **Severity:** blocker | trust | confusing | cosmetic
- **Notes:**
```

---

## 4. Freeze-window rules (operators + testers)

| Rule | Detail |
|------|--------|
| No live deploys | No production edits during an active tester session unless **P0 blocker** |
| Evidence first | Screenshot/video + template before debate |
| No cosmetic chase | Log P3; do not fix during window |
| No features | Feature ideas go to “Later” list, not fix queue |
| No architecture changes | Observation only; triage after window |
| Fixes after session | Batch triage; only trust/stability blockers before any expansion talk |

**P0 exception:** login down, cannot start any game, data loss, security — ops may hotfix; document SHA change separately (tag does **not** move without explicit freeze decision).

---

## 5. Observation priorities

Watch and note **hesitation**, not only hard errors:

| Signal | What to look for |
|--------|------------------|
| Navigation confusion | Wrong lobby vs mode room; “where is Find match?”; unexpected redirects |
| Reconnect weirdness | Refresh loses turn; duplicate obligations; stuck “waiting” |
| Chat / spectator pressure | Send stuck; spectator sees wrong UI; overlap with many tabs |
| Play Computer reliability | Start fails; wrong bot; missing `detail` on error |
| Tournament trust | Wrong bracket, grace ignored, rating change on 0-move void finish |
| Unexpected redirects | Login not → profile; dropped from game |
| Stale state | Old open seats; lobby not updating until refresh |
| Abandoned flows | Challenge sent but no game; find match no navigation |

---

## 6. Triage categories

| Level | Definition | Action in window |
|-------|------------|------------------|
| **P0** | Blocks login or any gameplay | Ops may intervene; log SHA/steps |
| **P1** | Damages trust or game legitimacy | Log + prioritize post-window fix |
| **P2** | Confusing but recoverable | Log; fix after review if frequent |
| **P3** | Cosmetic / polish | Log only; no fix during freeze |
| **Later** | Feature ideas | Backlog — **not** alpha blockers |

---

## 7. Post-test decision rule

After the tester window ends:

1. **Summarize** — count P0–P2 by area (lobby, game, nexus, tournament, Play Computer).
2. **Separate** — bugs vs feature requests (“Later” bucket).
3. **Fix order** — trust/stability blockers first; no Phase 1 expansion until Stage 0 observation is reviewed.
4. **Freeze integrity** — confirm production still `7c655fe` / tag unchanged unless ops documents a deliberate new freeze.

**Strategic bar:** Stage 0 answers *“does it stay coherent under real-user pressure?”* — not *“what should we build next?”*

---

## Operator quick reference

```powershell
# Verify tag (expect 7c655fe…)
git rev-list -n 1 alpha-stage0-20260521
```

**Do not commit during observation:** `supabase/.temp/cli-latest`, `docs/phase-locks/OPENING_ENCYCLOPEDIA_AUDIT.md`
