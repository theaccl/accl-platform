# Phase A Baseline State

Generated: 2026-04-09 (UTC)

## 1) Drift lock confirmation

- `npx supabase migration list` shows Local == Remote for every migration through `20260427120000`.
- Drift status: **zero pending drift**.

## 2) Schema snapshot (tables, constraints, RPCs)

This baseline snapshot reflects the live schema state represented by the fully applied migration chain.

### Core tables present (public)

- `games` (extended across migrations with mode/source_type/tournament/rating fields)
- `game_move_logs`
- `finished_game_analysis_jobs`
- `finished_game_analysis_artifacts`
- `tournaments`
- `tournament_entries`
- `tournament_matches`
- `player_ratings`
- `player_pattern_profiles`
- `trainer_generated_positions`
- `anti_cheat_events`
- `anti_cheat_enforcement_states`
- `anti_cheat_enforcement_override_history`
- `moderator_queue`
- `moderator_role_bindings`
- `moderator_queue_action_history`
- `moderator_role_audit_history`
- `user_eligibility`
- `vault_relic_records`
- `vault_relic_issuance_audit`
- `trophy_records`
- `trophy_issuance_audit`
- `prestige_profile_frames`
- `prestige_state_audit`
- `protected_position_fingerprints`

### Key constraints active

- `games_source_type_check` (includes `bot_game` and tournament sources)
- `finished_game_analysis_jobs_status_check`
- `finished_game_analysis_artifacts_type_check` (allows `placeholder`, `engine_structured`)
- `player_ratings_bucket_check` (six-bucket contract)
- `games_play_context_check`
- tournament status/format/integrity checks
- vault/trophy/prestige domain checks

### Key RPCs / functions active

- Queue and intake:
  - `get_finished_game_analysis_intake`
  - `enqueue_finished_game_analysis_job`
  - `claim_next_finished_game_analysis_job`
  - `finalize_finished_game_analysis_job`
  - `upsert_finished_game_analysis_artifact`
  - `get_latest_finished_game_analysis_artifacts`
- Finish pipeline:
  - `finish_game`
  - `finish_game_system`
  - `finish_game_core`
- Tournament enforcement:
  - `record_tournament_position_fingerprint`
  - `enforce_tournament_finality`
- Profile/public read models:
  - `get_public_profile_snapshot`
  - `get_public_profile_history`
  - `search_public_profiles`

## 3) Required environment/config

- `SUPABASE_ACCESS_TOKEN` (local CLI operations only)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (or `E2E_SUPABASE_SERVICE_ROLE_KEY` fallback in current server helper)
- `ACCL_ANALYSIS_QUEUE_SECRET`
- `BOT_USER_ID_CARDI`
- `BOT_USER_ID_AGGRO`
- `BOT_USER_ID_ENDGAME`

## 4) Operational proof outputs (baseline lock run)

### Queue job completion

- Enqueue: `job_id=4d92e6fb-9883-4707-af8c-4fdbe41d64a4`
- Process result: `final_status=completed`
- Final row: `status=completed`
- Result meta stage: `engine_structured_complete`
- Engine artifact id present: `89d4b7b1-31c1-43fb-be41-267a29a7cc38`

### Bot loop execution

- Bot start: `200 OK`, `game_id=17118801-aaac-4ca3-ac1c-f9eefe03947c`, `source_type=bot_game`
- Bot move #1: `200 OK` (`d2d4`)
- Bot move #2: `200 OK` (`c7c5`)
- Final bot game state advanced and persisted (turn switched, fen updated).

### Trainer generation

- For `source_game_id=7b181f19-f37f-47c5-b390-da4ec23af86b`
- `trainer_generated_positions` rows created: **2**
- Status for sampled rows: `approved`

### Tournament enforcement wall

- Tournament game finished, then attempted reopen (`status='active'` update).
- Reopen blocked: **true**
- Error: `Tournament games cannot reopen after finish`

---

This file is the lock snapshot for Phase A and can be treated as the baseline state before NEXUS work.
