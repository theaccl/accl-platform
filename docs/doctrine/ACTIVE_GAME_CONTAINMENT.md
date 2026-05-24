# Active-game containment doctrine (future)

**Status:** Doctrine only — **not implemented**. Do not ship as a rushed browser-back hack, route guard, or `beforeunload`-only block.

**Goal:** When a player starts an **active timed game**, the board becomes the **primary required surface**. The clock keeps running whether the player stays, navigates away, disconnects, or closes the tab. Timeout and finish rules apply where appropriate.

Applies to **tournament live**, **free-play live**, **timed Play Computer**, and **any active running-clock game** (1m, 3m, 5m, 10m, 30m, etc.). Does **not** apply the same strictness to **daily/async** correspondence.

---

## Principle

Once a timed game is active:

- The player should not casually leave the board, jump back to lobby, or treat the clock as pausable.
- Leaving, disconnecting, closing the tab, or walking away **does not stop the clock** (unless the mode is explicitly untimed/casual practice).
- If the clock expires, the game should finish by timeout where rules allow (see Phase 3A for free-play live system finish).

---

## Scope — containment by mode

| Category | Containment |
|----------|-------------|
| Tournament live | **Strictest** — leaving/disconnect may result in timeout or forfeit |
| Free-play live | Warning + containment; clock consequences apply |
| Play Computer — timed | Board containment applies; **normal UI leave requires resignation**; hard exit/disconnect does not pause or avoid timeout/abandon rules |
| Play Computer — untimed / casual trainer practice | More forgiving; may allow leaving without clock pressure |
| Daily / async | **Separate rules** — not live strict containment |
| Any active running-clock game (1m–30m+, PvP or bot) | Board is primary surface while clock runs |

---

## Timed Play Computer — resign-to-leave

Even against the computer, a **timed** game is not pausable. Bot moves and clock decay continue server-side.

### Normal UI navigation away

When the player tries to leave the board through **normal in-app navigation** (lobby, profile, nexus, etc.), the app must **not** silently abandon the game. Warn that leaving requires **resignation**.

**Prompt:**

“You have an active timed computer game. To leave the board, you must resign this game. Do you want to resign?”

| Option | Behavior |
|--------|----------|
| **No** | Stay on the board; game continues |
| **Yes** | Resign the game; player may leave |

Do **not** use weak copy such as “This timed computer game will continue if you leave the board.”

### Hard exit / disconnect

If the player **closes the tab**, **closes the browser**, **leaves the site**, **disconnects**, or otherwise exits **without** confirming resign:

- The game does **not** pause and cannot be avoided.
- Handle later via **disconnect, abandon, or timeout** rules (server-authoritative clock and finish paths).

---

## Future UX (implementation pass)

Dedicated **gameplay integrity / active-game UX** pass — not a single navigation hack.

### Navigation and chrome

- Hide or reduce distracting navigation during active **timed** games.
- Board remains primary; lobby/profile/nexus should not compete without warning.

### Leave warnings (copy direction)

| Context | Example message |
|---------|-----------------|
| Active timed PvP | “You have an active timed game. Leaving the board will not pause your clock.” |
| Tournament live | “Leaving or disconnecting may result in timeout or forfeit.” |
| Timed Play Computer (normal UI leave) | Resign prompt above — **No** / **Yes** |

### Redirect / re-engagement

- Pull host/creator back to the board when an opponent accepts (e.g. from Profile) — extend consistently for timed contexts.
- Re-open board when user returns with an active timed game in progress.

---

## Relationship to shipped work

| Layer | Role |
|-------|------|
| **Phase 3A timeout sweep** | System-finish expired free-play live games; clock does not wait for player return |
| **Phase 1 spectator list filter** | Hide clock-expired games from watch lists at read time |
| **This doctrine** | Future product UX + integrity rules; tournament/bot/timed variants |

---

## Explicit non-goals (do not build yet)

- No route guards, browser-back prevention, or game-page behavior changes in this doctrine pass.
- No bot logic, timeout cron, move validation, PGN, rating, or notation changes.
- Do not pause timed Play Computer on Profile/lobby navigation without resign-or-stay.
- Do not allow silent leave from timed Play Computer via normal UI.
- Do not apply tournament-strict containment to daily/async games.
- Do not conflate open/waiting **seats** (queue guard) with active timed **boards** — see Phase 3A runbook queue note.

---

## Known related follow-ups (separate passes)

- Queue/open-seat blocking copy — which waiting seat blocks accept, leave/cancel path
- Spectator “your move in another game” — hide on spectator surfaces
- Phase 3B / 0-move abandon (free-play)
- Tournament / daily timeout sweep if rules require

---

## References

- `docs/ops/PHASE_3A_LIVE_CLOCK_TIMEOUT_SWEEP.md` — authoritative timeout finish for expired free-play live
- `lib/liveClockExpiry.ts` — clock expiry parity (lists + sweep)
- Play Computer bot turn / clock: bot job pipeline (server-side continuation when player absent)
