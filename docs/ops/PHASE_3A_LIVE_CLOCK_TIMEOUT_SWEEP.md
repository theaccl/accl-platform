# Phase 3A — Live clock timeout sweep

**Status:** Deployed, operational, production-smoke **passed** (play.theaccl.com).

**Purpose:** Server-authoritative cleanup for **expired free-play live** games. Clock-expired rows are finished via `finish_game_system` so they no longer block joins or pollute spectator lists. Complements Phase 1 read-time list filters (`main` @ `fa18223`).

---

## Repo provenance

| Item | Value |
|------|--------|
| Sweep implementation | `9dee29b` — Add live clock timeout sweep |
| Cron + GET auth | `8aadb20` — Schedule live clock timeout sweep cron |
| Migration | `supabase/migrations/20260602120000_expire_live_clock_timeouts.sql` |
| RPC | `public.expire_live_clock_timeouts(p_batch integer default 25) returns integer` |
| Helpers (internal) | `clock_budget_ms_for_live_sweep`, `live_clock_flagged_loser` — keep aligned with `lib/liveClockExpiry.ts` |

**Scope (v1):** Free-play, `tempo = live`, both players seated, `status = active`, `last_move_at IS NOT NULL`, post-move clock timeout only. Result: flagged side loses; `end_reason = timeout`.

**Out of scope (v1):** 0-move abandon, tournament live, daily/correspondence.

---

## Production wiring

| Item | Value |
|------|--------|
| Internal route | `GET/POST /api/internal/live-clock-timeout/process?batch=25` |
| Vercel cron | `*/2 * * * *` (see `vercel.json`) |
| Secrets (Production, Sensitive) | `ACCL_LIVE_TIMEOUT_SWEEP_SECRET`, `CRON_SECRET` — **same value** |
| Cron auth | Vercel sends `Authorization: Bearer <CRON_SECRET>` |
| Fallback | If `ACCL_LIVE_TIMEOUT_SWEEP_SECRET` unset, route may use `ACCL_ANALYSIS_QUEUE_SECRET` (not recommended for prod) |

After changing secrets, **redeploy** production.

---

## Manual operator calls

### SQL (Supabase, service role)

```sql
select public.expire_live_clock_timeouts(25);
```

Returns count finished this batch. Idempotent — safe to rerun.

### POST (manual / external cron)

```bash
curl -sS -X POST "https://play.theaccl.com/api/internal/live-clock-timeout/process" \
  -H "content-type: application/json" \
  -H "x-accl-live-timeout-sweep-secret: $ACCL_LIVE_TIMEOUT_SWEEP_SECRET" \
  -d '{"batch":25}'
```

### GET (cron-style test)

```bash
curl -sS "https://play.theaccl.com/api/internal/live-clock-timeout/process?batch=25" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected JSON: `{ "finished": N, "rounds": M }`. `finished: 0`, `rounds: 1` when nothing to sweep.

---

## Production smoke result (passed)

- Migration applied; SQL sweep cleaned stale game(s).
- Manual POST and GET succeeded; Vercel Cron logs show **GET 200** on schedule.
- Timed-out live games are **system-finished** (`status = finished`, `end_reason = timeout`).
- Players are **no longer blocked** by timed-out `active` rows after sweep/cron.
- Watch as Spectator / Nexus live rail stay clean for expired games; **real live games still appear** while active.
- After timeout, spectator indicator clears within seconds.
- Finished/history and notification banner show timeout result (`finishedGameResultBannerText`).

---

## Known future work (not Phase 3A)

| Item | Notes |
|------|--------|
| Queue/open-seat UX | When blocked by a waiting/open seat, UI should show which seat, type, and leave/cancel/resume path |
| Spectator “your move in another game” | Hide for spectators or move outside board context |
| Phase 3B / 0-move abandon | Free-play first-move grace + `abandoned_before_move` if needed |
| Tournament / daily timeout sweep | Separate rules pass if product requires |
| Cron frequency | Currently `*/2`; can tighten to `*/1` if join-unblock delay is too long |

---

## Related

- Phase 1 list filter: `lib/liveClockExpiry.ts`, `fetchFreePlaySpectatableLobby`, `getLiveGames`
- Rating finish path: `finish_game_system` → `games_apply_free_rating_after_finish` (ensure return-path hotfix provenance `20260522180000` on prod)
