# Profile Rating Ticker — production migration verification

Run after applying migrations through `20260619171000_fix_daily_rating_bucket_precedence.sql`.
Do not re-run destructive DDL if objects already exist.

## Required migrations (repo)

| Timestamp | File |
|-----------|------|
| 20260619150000 | `accl_official_time_control_parity.sql` |
| 20260619120000 | `free_play_badge_settlement_foundation.sql` |
| 20260619160000 | `rating_history_ledger_foundation.sql` |
| 20260619170000 | `legacy_rating_bucket_and_badge_settlement_compat.sql` |
| 20260619171000 | `fix_daily_rating_bucket_precedence.sql` |

## SQL spot checks

```sql
select to_regclass('public.player_rating_history_ledger') as ledger;
select to_regclass('public.player_badge_state') as badge_state;

select public.classify_rating_bucket('free', 'daily', '1d');
select public.classify_rating_bucket('free', 'live', '5+5');

select public.classify_p1_rating_bucket('free', 'daily', '1d');
select public.classify_p1_rating_bucket('free', 'daily', '7d');
select public.classify_free_badge_track_key('daily', '1d');
select public.classify_free_badge_track_key('daily', '7d');
```

Expected: `free_daily`, `free_live`, `free_day`, `free_day`, `daily_1_day`, `daily_7_day`.

## Ledger live proof (validated)

Game `5f79f6d7-2368-4a49-b626-5f3fa7f3694b` — live append with `event_type='game'`, `is_backfilled=false`.

## Local / CI scripts

```bash
npx playwright test tests/unit/profileRatingTickerGapFill.spec.ts
npx playwright test tests/unit/acclTimeControls.spec.ts tests/unit/profileRatingTicker.spec.ts
powershell -File scripts/validate-rating-history-ledger-production.ps1
```
