# ACCL Historical Migration Reconciliation Record

**Decision:** Option B — preserve truthful Supabase migration history and maintain this separate ACCL reconciliation record
**Record date:** 2026-08-10
**Repository:** `C:\\Users\\theac\\ACCL\\accl-platform`
**Branch:** `main`
**Audited repository commit:** `3cb57a1f44ddf0da0efce06e5f78a31a3d8c7b9c`
**Production mutation status:** none — documentation only
**Later current-status update:** `20260625120000` is no longer a current R5. Phase 5–6 text below is retained as audit-time accounting; the post-R016 Case B application is recorded in §15.

## 1. Purpose and authority

This record accounts for the 49 historical local migration versions that were absent from the production `supabase_migrations.schema_migrations` ledger during the Phase 1–4 audit. It preserves the difference between:

1. **historical execution** — evidence that the SQL body associated with a particular version actually ran; and
2. **current-state reconciliation** — evidence that production currently contains the intended effect, a later reconciler carries it, or a later definition supersedes it.

Those facts are not interchangeable. Object existence, current schema equivalence, forward reconciliation, or supersession does not prove that a historical version executed. Accordingly, this record does not mark reconciled, superseded, ambiguous, absent, or indeterminate versions as applied.

This is the authoritative ACCL accounting record for the known divergence. The Supabase ledger remains the truthful record of versions actually recorded there; this document carries context that cannot be represented accurately by adding blanket ledger rows.

## 2. Non-action boundary

Creation of this record authorized no production or migration mutation. During Phase 5:

- no SQL was run;
- no Supabase production connection or write was made;
- no `supabase migration repair` command was run;
- no `supabase db push` command was run;
- `--include-all` was not used;
- no migration file was edited, renamed, moved, or deleted;
- no commit or push was made.

Standing operational rule:

- **Do not run bare `supabase db push` against production.**
- **Do not use `--include-all` against production.**
- Do not infer a repair set from current object presence.
- Any exact named-file application or future ledger repair requires a separate audit, staging/clone dry run where applicable, and explicit owner authorization.

## 3. Repository identity at Phase 5 authoring

The authoring session verified:

- branch: `main`;
- `HEAD`: `3cb57a1f44ddf0da0efce06e5f78a31a3d8c7b9c`;
- `origin/main`: `3cb57a1f44ddf0da0efce06e5f78a31a3d8c7b9c`.

The local checkout did not contain a resolvable `upstream/main` ref at Phase 5 authoring, although earlier audit lanes recorded an upstream ref at the same SHA. The worktree also already contained an untracked `.claude/` directory before this record was created. Phase 5 did not modify or remove that pre-existing directory.

## 4. Disposition model

The Phase 4 procedure was applied uniformly:

1. explicit historical-execution evidence → **R1**;
2. otherwise, duplicate version prefix → **R4**;
3. otherwise, live evidence shows the material effect absent → **R5**;
4. otherwise, an explicit recorded later reconciliation carries the effect → **R2**;
5. otherwise, production has a later or different definition → **R3**;
6. otherwise, the effect is present but execution is unproven, with no explicit reconciler or clean supersession → **R6**.

| Code | Meaning | Count | Ledger implication |
| --- | --- | ---: | --- |
| R1 | Historical execution proven | 6 | Candidate for a future, separately authorized repair decision; not authorized here |
| R2 | Current effect forward-reconciled | 9 | Do not repair as historically applied |
| R3 | Current effect superseded | 15 | Do not repair as historically applied |
| R4 | Duplicate-version ambiguity | 2 | Do not repair; one version cannot truthfully identify two files |
| R5 | Material effect absent / not applied | 2 | Do not repair; doing so would mask a real missing effect |
| R6 | Still indeterminate | 15 | Do not repair without historical-execution evidence |
| **Total** |  | **49** |  |

## 5. Complete 49-version accounting

### R1 — historical execution proven (6)

These are candidates only for a future repair decision. Phase 5 does not authorize or perform repair.

| Version | Local migration filename | Evidence and disposition |
| --- | --- | --- |
| `20260519200000` | `20260519200000_tournament_zero_move_rating_void.sql` | The `20260522180000` provenance artifact identifies this as the canonical body applied manually in SQL Editor on 2026-05-22. |
| `20260531170000` | `20260531170000_games_bot_settings.sql` | `PHASE_1H_BOT_SETTINGS_LOCK.md` records the migration as applied and its column/backfill verified. |
| `20260531180000` | `20260531180000_bot_move_jobs_queue_foundation.sql` | `PHASE_1IA_BOT_MOVE_JOBS_INFRA_LOCK.md` records SQL Editor application and live verification. |
| `20260531190000` | `20260531190000_record_bot_move_job_shadow.sql` | `PHASE_1IB_BOT_MOVE_SHADOW_LOCK.md` records the RPC migration as applied and DB verified. |
| `20260619171000` | `20260619171000_fix_daily_rating_bucket_precedence.sql` | BR1 evidence identifies the live `20260619171000` classifier body. |
| `20260619180000` | `20260619180000_free_play_true_elo_rating.sql` | The BR1 runbook records true-Elo live with the body preserved; live audit found `v2_elo_free` and the zero-move protection. |

### R2 — current effect forward-reconciled (9)

| Version | Local migration filename | Recorded reconciler / disposition |
| --- | --- | --- |
| `20260518130000` | `20260518130000_profile_identity_fields.sql` | `20260621135000` reconciles the profile columns and activity helper; only the public flag partially pre-existed. |
| `20260518150000` | `20260518150000_update_own_profile_identity_bio_word_rpc.sql` | `20260621130000` drops/recreates the RPC in its hardened void-return form. |
| `20260524131000` | `20260524131000_reassert_match_requests_live_time_control_check.sql` | `20260621120000` carries the canonical match-request time-control allowlist. |
| `20260526120000` | `20260526120000_expand_match_requests_live_time_control_check.sql` | `20260621120000` carries the canonical match-request time-control allowlist. |
| `20260528210000` | `20260528210000_reassert_match_requests_ltc_check_for_5_5.sql` | `20260621120000` carries the canonical match-request time-control allowlist. |
| `20260619120000` | `20260619120000_free_play_badge_settlement_foundation.sql` | BR1 (`20260621150000`) reconciles schema plus a dormant settlement shim; active settlement is intentionally absent. |
| `20260619150000` | `20260619150000_accl_official_time_control_parity.sql` | BR1 records the classifier/time-control portion as ratified live. |
| `20260619160000` | `20260619160000_rating_history_ledger_foundation.sql` | BR1 recreates the ledger foundation if absent; the earlier ±10 core is superseded. |
| `20260619170000` | `20260619170000_legacy_rating_bucket_and_badge_settlement_compat.sql` | BR1 replaces the compatibility behavior with a dormant shim; the classifier is superseded by `20260619171000`. |

### R3 — current effect superseded (15)

| Version | Local migration filename | Supersession / disposition |
| --- | --- | --- |
| `20260423140000` | `20260423140000_create_seated_game_guard_supersede_before_joiner_busy.sql` | The guard chain is superseded by the current public wrapper delegating to `private.create_seated_game_guard_core`. |
| `20260425150000` | `20260425150000_create_seated_game_guard_void_after_activation.sql` | Superseded by the later seated-game guard definition. |
| `20260427130000` | `20260427130000_hotfix_create_seated_game_guard_remove_started_at.sql` | Superseded by the later seated-game guard definition. |
| `20260519160000` | `20260519160000_game_player_chat_rls_status_normalize.sql` | The game-player chat policy is superseded by the later `20260529000000` policy state. |
| `20260520130000` | `20260520130000_create_seated_game_guard_match_integrity.sql` | Superseded by the later seated-game guard definition. |
| `20260522120000` | `20260522120000_create_seated_game_guard_postgrest_param_names.sql` | Superseded by the later seated-game guard definition. |
| `20260522180000` | `20260522180000_provenance_apply_free_play_rating_update_core_return_path.sql` | **Provenance-only / non-executed version.** The file was created after the manual hotfix, names `20260519200000` as the canonical body source, and is explicitly not evidence that version `20260522180000` ran. Its old ±10 body is also superseded by true Elo. |
| `20260524120000` | `20260524120000_expand_games_live_time_control_check.sql` | The games time-control constraint is superseded by the later canonical allowlist. |
| `20260528150000` | `20260528150000_lobby_games_realtime_rls_seated_and_live_only_supersede.sql` | Superseded within the later open-seat/RLS chain. |
| `20260528160000` | `20260528160000_free_play_supersede_not_daily_and_host_busy_skip_async.sql` | Superseded within the later open-seat/guard chain. |
| `20260528200000` | `20260528200000_free_play_async_join_no_supersede_and_host_busy_live_only.sql` | Superseded within the later open-seat/guard chain. |
| `20260529010000` | `20260529010000_create_seated_game_guard_async_tempo_branching.sql` | Superseded by the later seated-game guard definition. |
| `20260529120000` | `20260529120000_create_seated_game_guard_live_busy_excludes_async.sql` | Superseded by the later seated-game guard definition. |
| `20260529130000` | `20260529130000_hotfix_create_seated_game_guard_supersede_signature_alignment.sql` | Superseded by the later seated-game guard definition. |
| `20260531140000` | `20260531140000_game_move_logs_idempotency.sql` | The apply-move body is superseded by the later live 12-argument idempotent definition. |

### R4 — duplicate-version ambiguity (2)

| Version | Local migration filenames | Disposition |
| --- | --- | --- |
| `20260519120000` | `20260519120000_realtime_tester_chat_dm.sql`; `20260519120000_tester_bug_reports_game_context.sql` | One ledger version cannot establish which file ran. Current chat/realtime and bug-report effects do not resolve historical execution. |
| `20260530140000` | `20260530140000_apply_move_transactional_move_log.sql`; `20260530140000_supabase_security_advisor_remaining_red.sql` | One ledger version cannot establish which file ran. The move-log side is materially superseded; later reconciliation carries selected safe security effects. |

### R5 — material effect absent / not applied (2)

Phase 5 counted two R5 versions. That count remains the audit-time accounting. The only version that is still a current R5 is `20260426120100`. `20260625120000` retains its Phase 5 snapshot in this table and is current-classified in §15.

| Version | Local migration filename | Live evidence and disposition |
| --- | --- | --- |
| `20260426120100` | `20260426120100_match_requests_inbox_perf_indexes.sql` | Both intended match-request inbox indexes were absent. Treat as not applied. |
| `20260625120000` | `20260625120000_rating_initialization_baseline_1000.sql` | **Phase 5 snapshot (pre-R016; not incorrect when recorded):** Production still defaulted ratings to 1500; the audit found 106 zero-game rows at 1500, none at 1000, and all three migration-specific helpers absent. Treat as definitely not applied. **Current status (post-R016):** production effects applied and verified; out-of-band/Case B; `schema_migrations` row absent; do not execute again; history reconciliation pending separate Watcher authorization. See §15. |

### R6 — still indeterminate (15)

For these versions, current effects were present, but historical execution was not proven and no explicit later reconciler or clean supersession resolved the history.

| Version | Local migration filename | Disposition |
| --- | --- | --- |
| `20260515180000` | `20260515180000_tournament_try_spawn_game_ecosystem_scope.sql` | Effect present; execution unproven. |
| `20260519140000` | `20260519140000_realtime_tester_game_chat.sql` | Effect present; execution unproven. |
| `20260519165000` | `20260519165000_tournament_starts_at_additive.sql` | `starts_at` column and index present; exact historical body not proven. |
| `20260519180000` | `20260519180000_tournament_launch_checkin.sql` | Effect present; execution unproven. |
| `20260520120000` | `20260520120000_supersede_free_seated_exact_pair.sql` | Effect present; execution unproven. |
| `20260523120000` | `20260523120000_fix_games_insert_rls_recursion_lobby_chat_select.sql` | Effect present; execution unproven. |
| `20260527120000` | `20260527120000_free_play_open_seat_rls_slot_scoped.sql` | Effect present, but residual functions show the open-seat chain did not execute cleanly in repository order. |
| `20260528140000` | `20260528140000_repair_free_play_open_seat_policy_drop_order.sql` | Effect present, but residual functions show the open-seat chain did not execute cleanly in repository order. |
| `20260529000000` | `20260529000000_test_chat_game_player_in_play_rls_for_realtime.sql` | Current policy effect present; execution unproven. |
| `20260530120000` | `20260530120000_supabase_security_hardening.sql` | Current hardening effect present; execution unproven. |
| `20260530130000` | `20260530130000_supabase_security_rls_anti_cheat_and_moves.sql` | Current hardening effect present; execution unproven. |
| `20260530150000` | `20260530150000_supabase_security_final_red_cleanup.sql` | Current cleanup effect present; execution unproven. |
| `20260531150000` | `20260531150000_hotfix_apply_move_idempotency_return.sql` | Current effect present; exact historical body not proven. |
| `20260531160000` | `20260531160000_apply_bot_game_turn_system.sql` | Current bot-turn effect present; execution unproven. |
| `20260602120000` | `20260602120000_expire_live_clock_timeouts.sql` | Current clock-timeout effect present; execution unproven. |

The residual one-argument `auth_free_play_blocks_new_open_seat(uuid)` and `supersede_free_seated_games_for_pair` functions are specifically inconsistent with the drop behavior expected from parts of the open-seat chain. Their presence is evidence against treating current-state similarity as clean, ordered historical execution.

## 6. Duplicate-prefix register

Three duplicate 14-digit version prefixes exist and are frozen; historical files must not be renamed:

| Version prefix | Files | Ledger relationship |
| --- | --- | --- |
| `20260425120000` | `20260425120000_editable_profile_identity.sql`; `20260425120000_expand_match_requests_live_time_control_check.sql` | The production ledger contains this version, so it is not one of the 49 gaps. The row cannot identify which file supplied which effect. `20260621120000` forward-reconciles the safe match-request constraint effect and intentionally does not replay profile RPC changes. |
| `20260519120000` | `20260519120000_realtime_tester_chat_dm.sql`; `20260519120000_tester_bug_reports_game_context.sql` | Ledger gap; R4. `20260621120000` forward-reconciles safe bug-report effects and intentionally does not replay realtime publication membership. |
| `20260530140000` | `20260530140000_apply_move_transactional_move_log.sql`; `20260530140000_supabase_security_advisor_remaining_red.sql` | Ledger gap; R4. `20260621120000` forward-reconciles safe security effects and intentionally does not replay apply-move rewrites. |

## 7. Corrected provenance treatment for `20260522180000`

`20260522180000_provenance_apply_free_play_rating_update_core_return_path.sql` is headed **PROVENANCE ONLY**. It states that:

- the production hotfix was applied manually on 2026-05-22 before the repository file existed;
- the canonical function body source was `20260519200000_tournament_zero_move_rating_void.sql`;
- the file exists to document production provenance and reviewer diff.

Therefore:

- `20260519200000` is the R1 historical-execution candidate for the body that ran;
- `20260522180000` is an R3 provenance-only, non-executed version;
- recording both versions as applied would falsely turn one physical application into two historical executions.

## 8. June 19 Case B drift

The BR1 runbook records selective manual SQL Editor applications from the June 19 slice:

- `20260619120000`
- `20260619150000`
- `20260619160000`
- `20260619170000`
- `20260619171000`
- `20260619180000`

It labels the condition **Case B drift**: material schema partially ahead of the migration ledger. BR1 forward-converges the production state while intentionally refusing stale or prematurely active behavior. This supports R2 for the four reconciled versions and R1 only where exact live-body execution was separately established (`20260619171000` and `20260619180000`).

## 9. Bot phase-lock chronology anomaly

The bot phase-locks are explicit execution evidence for:

- `20260531170000`;
- `20260531180000`;
- `20260531190000`.

However, all three lock documents carry May 18, 2026 lock/verification dates for migrations whose version prefixes are May 31, 2026. The audit preserves the documents' explicit “Applied” and live-verification evidence while flagging the dates as internally inconsistent. The May 18 dates must not be used as reliable execution chronology without an independent source.

## 10. August named-file applications

The later controlled production lane applied these exact files through the named-file/manual SQL path:

- `20260804155321_chess_knowledge_layer_foundation_reconciliation.sql` — applied, privilege defect detected, minimally hardened, verified;
- `20260804182827_accl_badge_rank_bands_read_boundary.sql` — applied and verified.

Both versions are intentionally absent from `supabase_migrations.schema_migrations`. The repository script `scripts/apply-supabase-migration.mjs` executes a selected SQL file through the Supabase Management API but does not insert a migration-history row. Their absence is therefore documented named-file behavior, not authority to replay the files or to repair their ledger rows in this phase.

These two August versions are outside the 49 historical pre-August gaps and do not change the R1–R6 counts above.

## 11. Repair posture

No repair is authorized by this record.

If a future owner separately opens a ledger-repair lane, the only current historical-execution candidates are:

- `20260519200000`;
- `20260531170000`;
- `20260531180000`;
- `20260531190000`;
- `20260619171000`;
- `20260619180000`.

Even those six are candidates, not commands. A future lane must reassess operational coupling, CLI behavior, staging/clone results, production state, and owner approval at that time. Nothing in R2–R6 qualifies for automatic `migration repair --status applied`.

Post-R016, `20260625120000` is no longer a current R5; see §15. That later Case B application does not add it to the R1 repair-candidate list above and does not authorize history repair.

## 12. Evidence anchors

Repository evidence:

- `supabase/migrations/20260522180000_provenance_apply_free_play_rating_update_core_return_path.sql`
- `supabase/migrations/20260621120000_reconcile_legacy_duplicate_migration_versions.sql`
- `supabase/migrations/20260621130000_harden_update_own_profile_identity_rpc.sql`
- `supabase/migrations/20260621135000_reconcile_profile_identity_schema_prerequisites.sql`
- `supabase/migrations/20260621150000_production_rating_baseline_reconciliation.sql`
- `docs/runbooks/accl-rating-baseline-reconciliation-br1.md`
- `docs/phase-locks/PHASE_1H_BOT_SETTINGS_LOCK.md`
- `docs/phase-locks/PHASE_1IA_BOT_MOVE_JOBS_INFRA_LOCK.md`
- `docs/phase-locks/PHASE_1IB_BOT_MOVE_SHADOW_LOCK.md`
- `supabase/OPERATOR_RUNBOOK.md`
- `scripts/apply-supabase-migration.mjs`
- `supabase/migrations/20260625120000_rating_initialization_baseline_1000.sql`
- §15 Rating Initialization 1000 out-of-band/Case B production application (`ACCL-RI1000-016` / `ACCL-RI1000-R016`)

Audit evidence:

- Phase 1 reconciled 131 unique local versions, 80 production ledger versions, 0 remote-only versions, 51 local-only versions, and 49 historical gaps after excluding the two August targets.
- Phase 2 produced effect manifests and documentary provenance for all 49 historical gaps.
- Phase 3 used read-only production inspection to distinguish absent, present, reconciled, superseded, and indeterminate effects.
- Phase 4 applied the uniform R1–R6 procedure and corrected the provenance-only treatment of `20260522180000`.

## 13. Phase 5 attestation

**PHASE 5 COMPLETE — OPTION B RECORDED.**

This file is a documentation-only reconciliation record. Phase 5 made zero production changes, ran zero SQL, changed no migration files, changed no Supabase migration-history rows, and performed no commit or push.

## 14. Phase 6 repair-feasibility closure

**Decision date:** 2026-08-10
**Verdict:** **R1 REPAIR TECHNICALLY FEASIBLE BUT NOT OPERATIONALLY JUSTIFIED — PRESERVE OPTION B.**

Phase 6 reassessed the six R1 candidates without changing production or migration history. Supabase's documented repair mechanism could truthfully insert those six ledger rows without executing their SQL bodies, but doing so would leave 43 historical R2–R6 gaps plus the two intentionally absent August named-file versions. Partial repair would not resolve duplicate-version ambiguity, absent R5 effects, forward-reconciled R2 versions, superseded R3 versions, or indeterminate R6 versions.

Ordinary `supabase db push` may refuse because older local-only versions precede the newest recorded remote migration. Using `--include-all` would explicitly include the remaining historical gaps and risk replaying unsafe or intentionally omitted bodies. Therefore the standing prohibitions on bare production `db push` and production `--include-all` remain necessary after any six-row repair.

No paid empirical environment was authorized. Account-specific cost discovery reported **$10 per month** for a disposable project and **$0.01344 per hour** for a development branch; neither was created. The existing `accl-br1-path-b-disposable` environment was read-only inspected and rejected as a production-shaped test fixture because its 125-row ledger already recorded all six R1 versions, included staging-only duplicate surrogates, and stopped at `20260621150000`.

**Phase 6 final disposition:** do not repair the six R1 rows. Keep them as documented historical-execution candidates in this record, preserve the production ledger as-is, and require a new owner decision if material evidence or deployment strategy changes.

**Zero-change attestation:** Phase 6 made no production writes, ran no migration repair, `db push`, `db reset`, or `--include-all`, installed no CLI, created no Supabase project or branch, changed no migration file, and made no repository commit or push.

## 15. Rating Initialization 1000 out-of-band/Case B production application

**Record date:** 2026-08-14
**Authorization:** `ACCL-RI1000-016`
**Successful response:** `ACCL-RI1000-R016`
**This documentation candidate:** `ACCL-RI1000-019`
**Production mutation status of this section:** none — documentation only; this section does not authorize replay, repair, push, or deployment.

This section records a later production event that occurred after the Phase 5 R5 snapshot. It does not rewrite Phase 5 or Phase 6 decisions. The Phase 5 R5 evidence for `20260625120000` remains a truthful pre-application snapshot.

### Status

- Production already contains this migration’s schema/data effects.
- Application was out-of-band/Case B through Supabase MCP `execute_sql`.
- Application occurred once. No retry occurred.
- Immediate post-apply verification passed.
- Version `20260625120000` remains intentionally absent from `supabase_migrations.schema_migrations`.
- **Ledger absence does not mean the migration is unapplied or safe to apply.**
- **Do not execute `20260625120000` again.**
- **Do not use `db push --include-all`.**
- **Do not use a blind migration sweep.**
- Consult this section before any migration-history work.
- History repair requires separate Watcher authorization and is not authorized by this record.
- This record is evidence, not deployment authorization.

### Production identity

- project ref: `nlptviibefbzisyqswuv`
- project name: `accl-platform`
- region: `us-east-1`

### Applied source identity

Repository baseline used during application: `3cb57a1f44ddf0da0efce06e5f78a31a3d8c7b9c`

This documentation candidate is authored from pinned commit: `f5d51ee80fb393fe7dbae237422a81bd280eaa4d`

Migration: `supabase/migrations/20260625120000_rating_initialization_baseline_1000.sql`

| Identity | Value |
| --- | --- |
| Git blob | `f8873a5aee0877769a1b2c46f6590fb95ea30afc` |
| Raw LF bytes | `14517` |
| Raw LF SHA-256 | `eaa9bab3203909aca0a8772d5f83f74ee8a6dd945e7c921f6c62670a972f6108` |
| CRLF working-tree bytes | `14930` |
| CRLF SHA-256 | `24ee872822a4de5021b005a736d2f7ef8f104f22312490e98728a4ce92683997` |
| Wrapped payload bytes | `14976` |
| Wrapped SHA-256 | `6e466d9fc627a9369c23b9c9c39e0d17c792a01d591874831f7a3d36c832e064` |
| Wrapper prefix | `BEGIN;\nSET LOCAL lock_timeout = '5s';\n` |
| Wrapper suffix | `\nCOMMIT;` |

The wrapper suffix had no trailing newline.

### Application evidence

- channel: Supabase MCP `execute_sql`
- MCP result: success, body `[]`
- `COMMIT` inferred successful from successful execution of the explicit transaction payload
- apply-agent evidence identifier: `92b55df6-d7d7-47d8-8f11-5f77802c586f`
- reported evidence timestamp: `2026-08-10T17:23:41Z`

That timestamp is the reported post-verification cleanup/provenance timestamp. It is not a fabricated exact SQL `COMMIT` timestamp.

### Pre-apply aggregates

These are the immediate pre-application counts. They are not player-identifying rows.

- eligible / complete / partial: `3 / 3 / 0`
- major-family `1000/0` rows: `0`
- major-family total rows: `66`
- major-family legacy `1500/0` rows: `51`
- ledger rows: `206`
- platform-bot users with ratings: `1`
- badge rows / not-1500: `0 / 0`
- mixed anomaly: `0`
- ineligible-changed metric: `0`
- rating default: `1500`
- O2 sites `1500/0` versus `1000/0`: `6 / 0`

### Post-apply aggregates

- rating default: `1000`
- seed buckets: `12/12` at `1000/0`
- O2 sites `1000/0` versus `1500/0`: `6 / 0`
- corrected accounts: `3`
- corrected major-family rows: `18`
- major-family total rows: `66`, unchanged
- major-family legacy `1500/0` rows: `33`
- ledger rows: `206`, unchanged
- platform-bot aggregate: `1`, unchanged
- badge not-1500: `0`, unchanged
- trigger binding: present
- history entry `20260625120000`: absent

### Product scope

- New accounts now seed all 12 rating buckets at `1000/0`.
- Only the six official major families were corrected for eligible existing zero-game accounts.
- Players with games, tournament entries, rating-ledger activity, positive games played, mixed/non-legacy major-family states, or platform bots were not included.
- Non-major legacy buckets were not backfilled.
- Badge settlement remains separate at `1500`.
- No rating-ledger history was fabricated.

### Verification caveat

`ineligible_accounts_whose_ratings_changed_must_be_zero` was valid only during the immediate controlled post-apply window. It is not a durable production-health invariant and must not be reused later as one.

### Repair and replay boundary

This section does not add `20260625120000` to the six Phase 6 R1 repair candidates. It does not authorize `migration repair --status applied`, named-file replay, `db push`, or `--include-all`. History reconciliation remains a separate Watcher-authorized lane.
