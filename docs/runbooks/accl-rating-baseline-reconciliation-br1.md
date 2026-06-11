# ACCL Stage 1 — Rating Baseline Reconciliation (BR1) Operator Runbook

**Status:** Draft (uncommitted)
**Baseline:** `origin/main` @ `1b8b6ece85e4bbb080989dfb33e800f8fcd2bcd7`
**Migration file:** `supabase/migrations/20260621150000_production_rating_baseline_reconciliation.sql`
**Doctrine:** `docs/accl-stage1-canonical-overall-rating-doctrine.md`

---

## 1. Production selective manual / partial `20260619` history

Production received selective manual SQL Editor applies from the `20260619` slice. Live objects include true-Elo apply core, ledger foundation, classifier parity, and a badge compat shim — but `supabase_migrations.schema_migrations` is **missing** rows for some or all of:

```text
20260619120000
20260619150000
20260619160000
20260619170000
20260619171000
20260619180000
```

This is **Case B drift**: material schema partially ahead of migration ledger.

BR1 is a **forward convergent reconciliation** migration. It does not replay missing files and does not mutate historical ledger rows.

---

## 2. Historically executed vs operationally absorbed by BR1

| Category | Meaning |
|----------|---------|
| **Historically executed** | SQL that actually ran on production (manual paste, one-off script, or prior `db push`) and produced live objects. |
| **Operationally absorbed by BR1** | Repo migration bodies whose *effects* are already live (or superseded) and whose *remaining delta* is folded into BR1 instead of re-applying the original file. |

`schema_migrations` records **version applied**, not **how** it was applied or whether a version was partially superseded.

**Required external log** (outside `schema_migrations`):

```text
version | historically_executed | operationally_absorbed_by_br1 | notes
```

Examples after BR1:

```text
20260619180000 | yes (true-Elo live)     | no (body preserved, not replaced) | core unchanged
20260619120000 | partial (shim only)     | yes (schema + dormant shim)       | active settlement NOT installed
20260621150000 | pending                 | n/a                               | BR1 forward apply
```

---

## 3. Why naked `supabase db push` is prohibited before repair

On production today, `db push` would attempt missing `20260619` files **in filename order** before later migrations. Risks include:

- `20260619120000` installing **active** badge settlement (Stage 3 behavior)
- `20260619160000` / earlier bodies overwriting live true-Elo core with stale pre-Elo logic
- Duplicate or conflicting trigger/function replacements

**Order of operations:**

```text
BR1 named-file apply → verify → migration-history repair → migration list clean → db push --dry-run on staging clone
```

Never `db push` production before repair.

---

## 4. BR1 named-file apply procedure

**Preconditions (production):**

- Cross-event ledger duplicates = 0 (confirmed BR0F)
- Same-event ledger duplicates = 0
- Operator has reviewed BR0F DDL export pack

**Apply (production):**

```text
1. Maintenance window optional (BR1 is non-destructive to ledger; orphan trigger drop only)
2. Paste supabase/migrations/20260621150000_production_rating_baseline_reconciliation.sql
   into Supabase SQL Editor (single transaction)
3. Confirm Success
4. Run post-BR1 verification pack (Section 6)
```

**Alternative (Management API):**

```bash
node scripts/apply-supabase-migration.mjs 20260621150000_production_rating_baseline_reconciliation.sql
```

Note: `apply-supabase-migration.mjs` executes SQL but does **not** insert `schema_migrations` rows. Record BR1 in ledger separately per repair policy.

**Do not:**

- Run `supabase db push` on production before repair
- Insert `schema_migrations` rows for missing `20260619` versions before BR1 verification

---

## 5. V2 disposable-staging validation procedure

Docker is unavailable locally. **Mandatory** validation path before production apply or commit:

### Path B — pristine full chain

**BR0G/BR0H/BR0I finding (F-C):** The committed migration chain is incremental repair — not a from-zero bootstrap. Empty disposable staging requires a **staging-only pre-Git foundation pack** before `20260401090000`.

```text
Staging-only foundation (NOT production, NOT in supabase/migrations/):
  stage1-pathb-chain/tmp/staging-foundation/
    00000000000000_accl_pre_git_foundation_bootstrap_staging_only.sql

Production has no custom auth.users → profiles trigger. Profile rows are
application-side lazy inserts (lib/loadOwnProfileForAccount.ts), not DB triggers.
```

```text
1. Create disposable Supabase staging project
2. Clone repo worktree @ 1b8b6ec (stage1/br1-draft)
3. Apply staging-only foundation SQL to disposable Path B (owner-reviewed pack)
4. supabase link + supabase db push (committed chain only)
4. Inspect Path B baseline:
   - active apply_free_play_badge_settlement from 20260619120000
   - no games_apply_rating (repo never had orphan)
5. Apply BR1 draft via SQL Editor or apply script
6. Verify convergence matrix (Section 6)
```

### Path A simulation — production-shaped partial baseline

```text
1. Second staging DB OR manual partial-state simulation:
   - true-Elo core + ledger present
   - badge tables absent
   - compat shim (badge_settlement_function_missing_compat_shim)
   - orphan games_apply_rating trigger present (attach manually from prod export if needed)
2. Apply BR1 draft
3. Verify same convergence matrix as Path B
```

### Authorized staging rated smoke (after structural PASS)

```text
1. Finish one rated free-play game on staging
2. Expect:
   - rating movement exactly once per player/bucket
   - one mode-scope ledger row per player
   - repeat apply → already_applied
   - Vault hook still fires where eligible
   - player_badge_state row count remains 0
3. STOP if any player_badge_state row appears
```

---

## 6. Post-BR1 verification pack

Run in SQL Editor after BR1 apply:

```sql
-- Orphan trigger absent
select tgname from pg_trigger t
join pg_class r on r.oid = t.tgrelid
where r.relname = 'games' and not t.tgisinternal
  and tgname in ('games_apply_rating', 'games_apply_free_rating_after_finish');

-- Badge schema + row count
select to_regclass('public.player_badge_state') as pbs,
       to_regclass('public.accl_badge_rank_bands') as bands,
       (select count(*) from public.player_badge_state) as badge_rows,
       (select count(*) from public.accl_badge_rank_bands) as band_rows;

-- Dormant shim
select pg_get_functiondef('public.apply_free_play_badge_settlement(uuid,jsonb)'::regprocedure);
select obj_description('public.apply_free_play_badge_settlement(uuid,jsonb)'::regprocedure, 'pg_proc');

-- True-Elo marker
select position('v2_elo_free' in lower(pg_get_functiondef('public.apply_free_play_rating_update_core(uuid)'::regprocedure))) > 0 as has_true_elo;

-- accl_overall absent
select count(*) from public.player_ratings where bucket = 'accl_overall';

-- Ledger idempotency
select count(*) from (
  select player_id, rating_track_id, game_id
  from public.player_rating_history_ledger
  where game_id is not null
  group by 1,2,3 having count(distinct event_type) > 1
) x as cross_event_dupes;
```

**Expect:**

| Check | Expect |
|-------|--------|
| `games_apply_rating` | absent |
| `games_apply_free_rating_after_finish` | present |
| Vault hook in canonical trigger | present |
| `player_badge_state` | exists, 0 rows |
| `accl_badge_rank_bands` | exists, seeded (9 bands) |
| Shim `reason` | `stage3_badge_settlement_disabled` |
| Shim comment | contains `ACCL_STAGE3_BADGE_SETTLEMENT_DISABLED` |
| `settle_player_badge_state` body | `stage3_badge_state_mutation_disabled` |
| `settle_player_badge_state` direct callers | none reachable (dormant shim; owner-only EXECUTE) |
| `anon` / `authenticated` / `service_role` EXECUTE on mutation fns | all **false** |
| `player_badge_state` write privileges (anon/auth/service_role) | all **false** |
| True-Elo core | unchanged (`v2_elo_free`) |
| Snapshot `accl_rating` | still aliases `tournament_unified` |
| `accl_overall` | absent |
| Cross-event duplicates | 0 |

---

## 7. Migration-history repair ordering

```text
Step 1  BR1 apply to production (named file)
Step 2  Post-BR1 verification pack PASS
Step 3  V2 staging Path B + Path A simulation PASS
Step 4  Document historically_executed vs operationally_absorbed (Section 2 table)
Step 5  Repair schema_migrations on staging clone dry-run first:
        insert missing 20260619 versions ONLY after BR1 verified
        insert 20260621150000 (BR1) via normal apply path
Step 6  supabase migration list → no pending drift vs repo
Step 7  supabase db push --dry-run on staging clone → must not replay dangerous 20260619 bodies
Step 8  Production repair only after staging clone dry-run PASS + PO approval
```

**Do not** mark missing `20260619` rows historically applied **before** BR1 verification.

---

## 8. `db push --dry-run` verification after repair

On a **staging clone** that mirrors post-repair production ledger:

```bash
supabase db push --dry-run
```

**Expect:** no pending migrations, or only forward migrations already verified.
**Fail:** any attempt to apply `20260619120000` active settlement or pre-Elo apply core replacement.

---

## 9. Rollback outline

BR1 is designed to be low-risk; full rollback is manual.

| Object | Rollback action |
|--------|-----------------|
| Orphan `games_apply_rating` trigger | Reattach from pre-BR1 DDL export **only if** PO requires; not recommended (redundant with canonical) |
| Badge tables | `DROP TABLE player_badge_state; DROP TABLE accl_badge_rank_bands;` only if no Stage 3 dependency yet |
| Dormant shim | Restore prior compat shim body from export (`badge_settlement_function_missing_compat_shim`) |
| Rating core | **Do not rollback** — preserved unchanged |
| Ledger | **Do not mutate** |

If rated smoke shows `player_badge_state` rows:

```text
STOP → investigate shim overwrite failure → do not proceed to migration repair
```

---

## 10. Stage 3 remains disabled

BR1 intentionally:

- Creates badge **schema** only
- Installs **dormant** `apply_free_play_badge_settlement` and `settle_player_badge_state` shims
- **Revokes EXECUTE** on both mutation functions from `PUBLIC`, `anon`, `authenticated`, and `service_role` (owner-only internal calls via `SECURITY DEFINER` rating core)
- **Revokes table writes** on `player_badge_state` for `anon`, `authenticated`, and `service_role`; SELECT-only for `authenticated`
- Does **not** write exact_time_control ledger rows (settlement shim returns `applied: false`)

Stage 3 activation requires a **separate forward migration** replacing the shim after badge doctrine, visuals, and settlement timing are authorized.

---

## Out of scope for BR1

```text
F1 (accl_overall hidden foundation)
U2 / U3 (global uncap)
O2 / O3 / C1 (overall cutover)
T1–T4 tournament settlement
Profile ticker UI
schema_migrations repair (this runbook documents; repair is a later step)
```
