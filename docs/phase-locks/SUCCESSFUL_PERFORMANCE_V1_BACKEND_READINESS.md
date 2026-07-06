# Successful Performance v1 — Backend Readiness (Stage 1 Lane)

Lane: `ACCL_STAGE1_SUCCESSFUL_PERFORMANCE_BACKEND_READINESS_PATHWAY`
Migration: `20260705120000_successful_performance_read_foundation.sql`
Static tests: `tests/unit/successfulPerformanceReadMigration.spec.ts`
Runtime verification: `supabase/SUCCESSFUL_PERFORMANCE_V1_RUNTIME_VERIFICATION.sql`

---

## Contract note — absent-cell semantics (`successful_performance_v1`)

Free-play broad-mode/color and exact-control/color cells with zero eligible games are **omitted** from the response. Consumers must interpret an absent cell as **games = 0** and **unlocked = false**. Battlefield lifetime is always materialized, including at zero games.

Additional contract facts:

- **`percentage`** is an intentional derived field in `successful_performance_v1` (score / eligible games × 100 when eligible games > 0).
- **`percentage` is not a rating** and must not be treated as Elo or bucket rating data.
- When Battlefield lifetime has zero eligible games: **games = 0**, **percentage = null** (not numeric zero).

---

## Rollback record (subtractive, data-free)

Rollback for this lane is **subtractive only**. It removes the objects introduced by `20260705120000_successful_performance_read_foundation.sql`. It does **not** rewrite historical data, alter O2, settlement, rating logic, triggers, or frontend behavior.

### Functions to drop (exact signatures)

```sql
drop function if exists public.get_own_successful_performance();

drop function if exists public.successful_performance_strict_control(text, text);

drop function if exists public.successful_performance_mode_from_control(text);

drop function if exists public.successful_performance_player_outcome(text, uuid, uuid, uuid);
```

### Indexes to drop

```sql
drop index if exists public.games_finished_rated_white_player_idx;

drop index if exists public.games_finished_rated_black_player_idx;
```

### Rollback properties

| Property | Value |
|----------|-------|
| Subtractive | Yes — drops functions and indexes only |
| Data-free | Yes — no game row updates or deletes |
| Historical rewrite | No |
| O2 impact | No |
| Settlement impact | No |
| Frontend impact | No |

Execute rollback only on environments where this migration was applied and reversal is explicitly authorized.

---

## Schema constraint evidence (repository)

| Constraint | Created in repository migrations? | Evidence |
|------------|-----------------------------------|----------|
| `games_play_context_check` | **Yes** | `supabase/migrations/20260405120000_rating_architecture.sql` line 7 — `check (play_context in ('free', 'tournament'))` |
| `games_end_reason_check` | **No DDL in repo** | Referenced in comments/docs only (e.g. `20260430310000_create_seated_game_guard_end_reason.sql` line 2; `docs/phase-locks/PHASE_1_TOURNAMENT_NOSHOW_OPS.md`) |
| `games_result_check` | **No DDL in repo** | Not found in `supabase/migrations/`; production ops docs assume allow-list behavior |

### Drift conclusion

- **Repository migration history creates `games_play_context_check`** (`20260405120000_rating_architecture.sql:7`) only when `play_context` is absent before that migration runs.
- **Path B foundation bootstrap** (`00000000000000_accl_pre_git_foundation_bootstrap_staging_only.sql`) pre-seeds `play_context NOT NULL` without the CHECK, so the guarded `ADD COLUMN IF NOT EXISTS` in `20260405120000` no-ops and **`games_play_context_check` is not created** on foundation + chain targets.
- **Accepted production evidence `SP_SECTION_2_constraints.csv` does not show `games_play_context_check`.** Treat that as migration-application drift between repo history and the audited production catalog.
- **Production-faithful behavior** must still be protected by RPC exclusion when invalid values are stored or when the constraint is absent.
- **Foundation `games_end_reason_check`** includes `no_first_move`; production end-reason catalog differs. **No `games_result_check`** is authored in the repository chain represented by this lane.
- **Foundation `games.white_player_id` is NOT NULL**; production catalog may permit nullable White. Dual-branch probes preserve evidence across both shapes.
- The runtime report (`spv1_assertions.detail`) records the branch exercised for each probe.

Production evidence reference: external live verification SQL and audit packet (`SP_SECTION_2_constraints.csv`) — not re-run in this lane.

### Expected Path B local branches (foundation + 130 migrations)

Dual-branch runtime probes record whichever branch the target catalog exercises. On the documented Path B foundation pack, expect:

| Probe | Expected branch | Reason |
|-------|-----------------|--------|
| `no_first_move` | `branch=rpc_exclusion` | Foundation allow-list admits `no_first_move`; RPC void predicate excludes |
| malformed result | `branch=rpc_exclusion` | No `games_result_check` in foundation or repo chain |
| invalid `play_context` | `branch=rpc_exclusion` | No `games_play_context_check` after guarded ADD no-op |
| missing white player | `branch=constraint_rejection` | Foundation `white_player_id NOT NULL` rejects UPDATE to null |

### Production catalog differences

| Aspect | Path B foundation + chain | Production evidence |
|--------|---------------------------|---------------------|
| `no_first_move` in end-reason allow-list | **Yes** (foundation) | **No** — production constraint does not admit `no_first_move` |
| `games_result_check` | Absent | Present |
| `games_play_context_check` | Often absent (foundation pre-seed) | Absent in `SP_SECTION_2_constraints.csv` |
| `white_player_id` nullability | **NOT NULL** | Nullable White permitted |

Dual-branch probes remain in the runtime script so either catalog shape produces auditable evidence without false passes.

---

## Runtime verification (non-production only)

**Do not run against production project `nlptviibefbzisyqswuv`.**

The script contains psql meta-commands (`\set ON_ERROR_STOP on`) and must **not** be pasted into the Supabase SQL Editor.

### Apply migration (local, non-production)

Confirm the exact command against your locally installed Supabase CLI version before execution. Examples:

```bash
supabase db reset --local
# or
supabase migration up --local
```

Do **not** use `supabase db push --local` in lane instructions unless your CLI version documents it as the supported local apply path.

### Run behavioral verification

```bash
psql "$NON_PRODUCTION_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/SUCCESSFUL_PERFORMANCE_V1_RUNTIME_VERIFICATION.sql
```

The script uses `BEGIN` … `ROLLBACK` so fixture users, games, move logs, and tournaments are not persisted.

Fixture mutations run as the captured session owner role (`spv1.owner_role`, with null-safe restore). Simulated `authenticated` role is active only during RPC invocation via `request.jwt.claims`.

Schema preflight also verifies `auth.users` columns used by fixture user creation.

### Authorized target selection (historical — superseded)

Earlier in this lane, runtime verification was blocked because no authorized non-production target was available in the worktree. **That condition was superseded** by the completed local verification on `127.0.0.1:54322` (Message 179).

---

## Local migration replay and runtime status

Local target `127.0.0.1:54322` — **migration replay completed successfully** (Message 172).

| Field | Value |
|-------|-------|
| Migration bodies executed | **130** |
| `schema_migrations` rows | **127** (one per unique version) |
| Latest version | `20260705120000` |
| SP migration applied | **Yes** |
| SP catalog/security verification | **Passed** |
| Rating-init replay | **Complete** (temp transaction wrapper; original restored) |
| Foundation hash | `9b7f850ec5c296688b142ae20c15304cd243b29f88aa75064e3e5357a1070fea` |

**Pre-Git foundation bootstrap caveat:** Path B foundation pack applied before git migration chain; catalog drift documented below.

**Duplicate-version caveat:** Local `schema_migrations` contains 127 rows, one per unique version. Three second files from frozen duplicate-version groups were executed manually by psql at their exact historical positions and cannot hold separate ledger rows because each version key is already consumed. Their execution is evidenced by locked hashes, transcripts, and catalog effects.

**Seated-guard caveat:** Three `create_seated_game_guard(uuid, jsonb)` DROP shims applied at exact 42P13 collision points during five-stop replay.

**BOM caveat:** Migration `20260621190000` was applied locally from a temporary same-path BOM-free replacement; the original BOM-bearing file was restored byte-identically and the ledger row is truthful.

**Rating-init caveat:** Migration `20260625120000` was applied locally from a temporary same-path replacement equal to the committed file (`24ee87…`) plus a prepended `begin;` line and appended `commit;` line, realizing the file's documented single-transaction intent under a CLI that does not supply one. The SQL text executed is byte-identical to the committed body. The ledger row is truthful. The committed file was restored byte-identically and verified.

### R6 final runtime verification (Message 179 — PASS)

| Field | Value |
|-------|-------|
| Date | 2026-07-06 |
| Target | `127.0.0.1:54322` |
| PostgreSQL | 17.6 |
| Script hash (R6) | `82795b41cadac7436f279d703fe0940bfd28083b4263508bcb10d0bf83b86d28` |
| Execution | `docker exec … psql -v ON_ERROR_STOP=1 -f SUCCESSFUL_PERFORMANCE_V1_RUNTIME_VERIFICATION.sql` |
| Total assertions | **80** |
| Passed | **80** |
| Failed | **0** |
| Per-section counts | absent 2, auth 6, battlefield 8, classifier 27, eligibility 15, numeric 1, privacy 7, response 3, scoring 5, unlock 6 |
| Explicit ROLLBACK | **Yes** |
| Fixture persistence | **Zero** |
| Final runtime verdict | **PASS** |

#### Observed Path B branch details

| Probe | Observed detail |
|-------|-----------------|
| `no_first_move` | `branch=rpc_exclusion storage reachable` |
| malformed result | RPC exclusion path — assertion `exclude unsupported result via RPC` passed (no `games_result_check` present) |
| invalid `play_context` | RPC exclusion path — assertions `invalid play_context excluded from free-play lane` and `…tournament lane` passed (no `games_play_context_check` present) |
| missing White | `branch=constraint_rejection column=white_player_id err=null value in column "white_player_id" of relation "games" violates not-null constraint` |

All four probes match expected Path B branches.

#### Post-runtime catalog/security (Message 179)

- SP RPC + 3 helpers + 2 indexes: present
- SECURITY DEFINER, STABLE, `search_path=pg_catalog, pg_temp`
- PUBLIC/anon EXECUTE: denied; authenticated: granted
- `games_play_context_check`: absent
- `games_end_reason_check`: present
- `games_result_check`: absent
- `games_source_type_check`, `games_live_time_control_check`: present
- `white_player_id`: NOT NULL; `black_player_id`: nullable

**No production contact** — local disposable database only.

### Prior runtime attempts (historical)

**R4** (`69321c29…`): FOREACH syntax error before any assertion.
**R5** (`77c8ebca…`): 39 assertions reached; failed on SQL-NULL vs JSON-null percentage check. Zero fixture persistence.

### Non-blocking hardening ledger (future scope)

- `pg_temp.spv1_assert` currently uses `IF NOT p_ok`, which treats SQL NULL as pass.
- Future hardening should use `coalesce(p_ok, false)`.
- Future explicit JSON-null comparisons should prefer `IS NOT DISTINCT FROM 'null'::jsonb`.
- This did **not** affect the R6 result against the hash-locked migration because the `percentage` key is always materialized in the Battlefield lifetime object.

---

## Pre-commit checklist (Fable 5)

| Item | Status |
|------|--------|
| Migration approved as written | Yes |
| Static migration tests (28) | **Pass** (28/28) |
| Static runtime script tests (14) | **Pass** (14/14) |
| Runtime script R4/R5/R6 corrections | Applied |
| Runtime behavioral verification (R6) | **PASS** — 80/80 assertions, explicit ROLLBACK |
| Absent-cell contract documented | Yes (this file) |
| Rollback record corrected | Yes (this file) |
| Commit | **Blocked** pending final Fable runtime review |
