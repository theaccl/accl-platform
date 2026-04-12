# Analysis Queue Ops Runbook

This runbook is for the server-only finished-game analysis queue foundation.

## Required Secrets

- `ACCL_ANALYSIS_QUEUE_SECRET` (sent as `x-accl-analysis-queue-secret`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

## Auto-enqueue on game finish

When `games.status` becomes `finished` (insert or update), trigger `games_enqueue_finished_game_analysis_after_finish` calls `enqueue_finished_game_analysis_job` with correlation id `auto:game_finished`. Failures are logged with `RAISE WARNING` and do not roll back the game row.

- **Finished-only:** enqueue always goes through `get_finished_game_analysis_intake` inside the RPC; non-finished rows never get a `queued` job from intake.
- **Dedupe:** unique index on `finished_game_analysis_jobs(game_id)`. Repeats return the same job id. Rows in `no_finished_intake` or `failed` are **upgraded** to `queued` when intake is later available (e.g. late finish or retry).
- **Audit:** `get_finished_game_analysis_job_summary(game_id)` — participants or `service_role`; `never_queued`, `job`, `artifact_count`, `has_artifact`.

## Scheduled Processing (Cron-Friendly)

Invoke processor every minute (example):

```bash
curl -sS -X POST "https://<host>/api/internal/analysis-queue/process" \
  -H "content-type: application/json" \
  -H "x-accl-analysis-queue-secret: $ACCL_ANALYSIS_QUEUE_SECRET" \
  -d '{"batch":5}'
```

The processor:

1. claims queued jobs safely (`SKIP LOCKED`)
2. re-fetches canonical payload only via `get_finished_game_analysis_intake`
3. writes a placeholder artifact row (`finished_game_analysis_artifacts`)
4. finalizes as `completed` / `failed` / `no_finished_intake`

## Queue Visibility

Latest jobs with optional filter:

```bash
curl -sS "https://<host>/api/internal/analysis-queue?limit=50&status=failed&stale_after_seconds=900" \
  -H "x-accl-analysis-queue-secret: $ACCL_ANALYSIS_QUEUE_SECRET"
```

Ops summary + samples:

```bash
curl -sS "https://<host>/api/internal/analysis-queue/ops?stale_after_seconds=900&sample_limit=20" \
  -H "x-accl-analysis-queue-secret: $ACCL_ANALYSIS_QUEUE_SECRET"
```

## Stale Running Recovery

Current strategy: **mark stale `running` jobs as `failed`** (safe, avoids duplicate work).

```bash
curl -sS -X POST "https://<host>/api/internal/analysis-queue/ops" \
  -H "content-type: application/json" \
  -H "x-accl-analysis-queue-secret: $ACCL_ANALYSIS_QUEUE_SECRET" \
  -d '{"stale_after_seconds":900,"limit":100}'
```

`result_meta` is annotated with:

- `ops_recovery: true`
- `ops_recovery_strategy: "mark_failed"`
- stale timeout metadata

## Notes

- No live/current games should enter this path: intake RPC returns `null` for non-finished rows.
- No engine scoring is performed yet; `completed` is placeholder lifecycle proof only.

