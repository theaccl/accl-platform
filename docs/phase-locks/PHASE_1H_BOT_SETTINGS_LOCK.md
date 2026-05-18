# Phase 1H Lock Snapshot — `games.bot_settings` storage contract

**Status:** GREEN (gates satisfied)  
**Locked:** 2026-05-18 (UTC)  
**Baseline role:** Storage-contract baseline before Phase 1I. Do not begin Phase 1I until explicitly unlocked.

**Prerequisite phases (locked):** 1E (transactional move logs), 1F (idempotency), 1G (composite bot-game RPC).

---

## 1) Migration applied

| Item | Value |
|------|--------|
| Migration file | `supabase/migrations/20260531170000_games_bot_settings.sql` |
| Apply method | Supabase SQL Editor (manual) |
| Column | `public.games.bot_settings jsonb NULL` |
| Backfill | Legacy `rating_last_update.accl_bot_v1` → `bot_settings` where `source_type = 'bot_game'` (does not delete legacy data) |

---

## 2) Schema / storage verification

- [x] `games.bot_settings` column exists (`information_schema` / dashboard verified)
- [x] Backfill verified (legacy bot games with `accl_bot_v1` in `rating_last_update` received `bot_settings` with `migratedFrom: rating_last_update` where applicable)
- [x] New bot games write config to `bot_settings` only (`encodeBotGameConfigRow` → `bot_settings`)
- [x] New bot games do **not** write bot config into `rating_last_update` (`ratingLastUpdateHasBotConfig: false` on smoke game)

**Write shape (new games):**

```json
{
  "version": "accl_bot_v1",
  "difficulty": 2,
  "personalityStyle": "balanced",
  "opponentLabel": "...",
  "botProfileId": "<bot profile uuid>",
  "createdFrom": "free_computer"
}
```

**Read order:** `bot_settings` first, fallback `rating_last_update.accl_bot_v1` (`parseBotGameConfigFromGameRow`).

---

## 3) Smoke proof (local `:3001`)

| Field | Result |
|-------|--------|
| Command | `node scripts/phase-1e-transactional-move-log-smoke.mjs --skip-migration` |
| `ACCL_BASE_URL` | `http://localhost:3001` |
| Exit code | `0` |
| Smoke game ID | `3949264a-5529-4d21-8581-18b9d1e6fe05` |
| `rpcAcceptsMoveLog` | `true` |
| `botSettingsPresent` | `true` |
| `ratingLastUpdateHasBotConfig` | `false` |
| `pliesPlayed` | `4` |
| `moveLogCount` | `4` |
| `replayIntegrity.ok` | `true` |
| `replayIntegrity.plyCount` | `4` |
| Analysis | Processed (`processOk: true`) |
| `errors` | `[]` |

**Post-smoke spot-check (optional):**

```sql
select id, bot_settings, rating_last_update
from public.games
where id = '3949264a-5529-4d21-8581-18b9d1e6fe05';
```

Expect `bot_settings` populated; `rating_last_update` must not contain `accl_bot_v1`.

---

## 4) Code artifacts (this lock)

| Area | Path |
|------|------|
| Config read/write | `lib/bot/botGameConfig.ts` |
| Bot game insert | `lib/gameStartupInsert.ts` (`botGameInsert`) |
| Bot game start API | `app/api/bot/game/start/route.ts` |
| Submit-move selects | `app/api/game/submit-move/route.ts`, `lib/server/submitMoveBotGameCommit.ts` |
| Unit tests | `tests/unit/botSettingsStorage.spec.ts` |
| Smoke assertions | `scripts/phase-1e-transactional-move-log-smoke.mjs` |

---

## 5) Reproduce smoke (after migration)

**Terminal 1 — dev:**

```powershell
cd C:\Users\Chees\accl-platform
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"
$env:PORT="3001"
npm run dev
```

**Terminal 2 — smoke:**

```powershell
cd C:\Users\Chees\accl-platform
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"
$env:ACCL_BASE_URL="http://localhost:3001"
$env:PHASE_1E_WHITE_PROFILE_ID="c278a6d5-6fc5-4f82-a0ea-dbca1a5cee34"
$env:PHASE_1E_BLACK_PROFILE_ID="9bc30963-68d9-41b7-a442-b38c450301d2"
node scripts/phase-1e-transactional-move-log-smoke.mjs --skip-migration
```

---

## 6) Known residual (acceptable at 1H)

- Older `bot_game` rows may still have `rating_last_update.accl_bot_v1` alongside backfilled `bot_settings`; parser fallback preserves compatibility.
- `rating_last_update` is not scrubbed on legacy rows in this phase.

---

## 7) Phase 1I — plan only (not started)

Hold Phase 1I **implementation** until this lock is explicitly superseded.

- **Plan (no code):** `docs/plans/PHASE_1I_BOT_MOVE_JOBS_PLAN.md` — `bot_move_jobs` queue architecture  
- Deferred tracks: computer-play UX polish, opening/encyclopedia foundation, tester-prep operational gate  

---

This file is the lock snapshot for Phase 1H and is the storage-contract baseline before further computer-play expansion.
