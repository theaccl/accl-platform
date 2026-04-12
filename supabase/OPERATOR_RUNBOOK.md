# ACCL — Supabase operator runbook (Phase 7)

Use when **live DB inspection is not done in CI/Cursor**. Goal: copy outputs back into `docs/ACCL-RUNTIME-AUDIT-AND-TEST-PLAN.md` Phase 7 §52 table (live evidence column).

## 1. Where to run SQL

1. Open **Supabase Dashboard** → your project → **SQL Editor**.
2. Run sections from `MANUAL_VERIFICATION_PACK.sql` **in order** (A → E), or paste the whole file if you prefer.
3. For Vault/Trophy/Prestige verification packs, run `VERIFICATION_CANDIDATE_HELPERS.sql` first to pick valid IDs.
4. If profile/vault shows schema-cache missing-table errors, run `IDENTITY_SCHEMA_RECONCILIATION.sql` first.

## 1.1 Identity table reconciliation workflow

When you see errors like:

- `Could not find the table 'public.trophy_records' in the schema cache`
- `Could not find the table 'public.prestige_profile_frames' in the schema cache`
- `Could not find the table 'public.vault_relic_records' in the schema cache`

Run:

1. `supabase/IDENTITY_SCHEMA_RECONCILIATION.sql`
2. Check table existence and policy sections.
3. Verify migration versions (section 4 query, if `supabase_migrations.schema_migrations` exists).
4. If tables exist but API still errors, run schema cache reload hint:
   - `NOTIFY pgrst, 'reload schema';`

Expected migration versions for identity tables:

- `20260412120000` (`vault_relic_records`)
- `20260417120000` (`trophy_records`)
- `20260420120000` (`prestige_profile_frames`)
- `20260425120000` (`profiles.bio`, `profiles.avatar_path`, `update_own_profile_identity`, `profile-avatars` bucket/policies)

## 2. What to capture (paste into audit or ticket)

| Step | Query block | Save as |
|------|-------------|---------|
| A | RLS flags for `games`, `match_requests`, `game_move_logs`, `profiles` | Table screenshot or CSV |
| B | Full `pg_policies` rows for those tables | Same |
| C | `finish_game` catalog row + **`pg_get_functiondef` output** | **Full function text** (redact secrets if any) |
| D | `role_table_grants` for the four tables | Same |
| E | `pg_publication_tables` for `supabase_realtime` | Same |

## 3. How to interpret

### Games / match_requests policies

- **Safer:** Explicit policies limiting **INSERT/UPDATE** to rows where `auth.uid()` is `white_player_id`, `black_player_id`, or related request participants; separate policies for SELECT.
- **Dangerous:** RLS **off** on `games` with broad **GRANT** to `anon` or `authenticated` on **ALL** privileges; or a single permissive policy like `using (true)` on UPDATE without column or row checks.

### game_move_logs

- **Expect:** RLS **on**; policies align with `20260401120000_game_move_logs.sql` (participant SELECT; INSERT with `player_id = auth.uid()`).
- **Divergent:** No policies in live DB though migration exists in repo → deployment drift.

### finish_game

- **Safer:** `SECURITY DEFINER` with **explicit checks** (e.g. caller is a player, game `status` active); updates ratings inside function; revokes direct EXECUTE from `anon` if appropriate for your model.
- **Dangerous:** `SECURITY INVOKER` only while **games** policies are missing; **no** seat/status checks; executable by any role that can call PostgREST RPC without validation.
- **Unknown until you run:** exact `p_result` / `p_end_reason` handling vs **terminal** outcomes (`checkmate`, etc.) only in `persistMove` — compare function body to `app/game/[id]/page.tsx` `gameOverFieldsAfterMove`.

### Realtime publication

- **Expect:** `games`, `game_move_logs`, and (if used) `match_requests` listed under `supabase_realtime` for your environment.
- **Red flag:** `games` missing from publication while clients rely on **postgres_changes** without polling fallback.

## 4. Update the audit doc

After running the pack, edit **Phase 7 §52** and **Phase 8 §61** in `docs/ACCL-RUNTIME-AUDIT-AND-TEST-PLAN.md` (§61 is the live-ingest table for closure):

- Set **live DB evidence** to a short note (e.g. “2026-04-01: RLS on games = yes, 3 policies, …”).
- Set **status** to **verified** only for objects you actually checked.

**Do not** mark **verified** if you only reviewed repo files.

---

## 5. Vault emission verification (finished-game winner hook)

Before running `VAULT_EMISSION_VERIFICATION.sql`, run:

- `supabase/VERIFICATION_CANDIDATE_HELPERS.sql`
- Copy one `game_id` from:
  - **1A** (winner game) -> `WIN_GAME_ID`
  - **1B** (draw/no-winner game) -> `DRAW_GAME_ID`

Run `supabase/VAULT_EMISSION_VERIFICATION.sql` after replacing the two placeholder game UUIDs:

- `WIN_GAME_ID`: finished game with a winner
- `DRAW_GAME_ID`: finished draw/no-winner game

Validation targets:

1. **Winner emits once**
   - emitter returns `issued: true` (or `already_issued` if previously emitted)
   - one relic row exists for milestone key `game_finish:<game_id>:winner`
   - audit row exists for emitter `emit_vault_relic_for_finished_game_winner`

2. **Retry idempotent**
   - second call returns `issued: false`, `reason: already_issued`
   - relic row count for milestone key remains `1`
   - audit shows repeat behavior

3. **Draw/no-winner skips**
   - draw call returns non-issued skip reason (`no_winner`)
   - relic row count for draw milestone key remains `0`
   - audit contains `outcome = skipped`

Audit focus columns:

- `emitter`
- `source_game_id`
- `milestone_key`
- `outcome` (`issued|already_issued|skipped|error`)
- `details` (JSON payload/error)

---

## 6. Trophy emission verification (tournament champion emitter)

Before running `TROPHY_EMISSION_VERIFICATION.sql`, run:

- `supabase/VERIFICATION_CANDIDATE_HELPERS.sql`
- Copy one ID from:
  - **2A** -> `CHAMPION_TOURNAMENT_ID`
  - **2B** -> `INCOMPLETE_TOURNAMENT_ID`
  - **2C** -> `NO_CHAMP_TOURNAMENT_ID` (optional; may be empty in healthy data)

Run `supabase/TROPHY_EMISSION_VERIFICATION.sql` after replacing placeholder tournament UUIDs:

- `CHAMPION_TOURNAMENT_ID`: completed tournament with valid final-match winner
- `INCOMPLETE_TOURNAMENT_ID`: not completed tournament
- `NO_CHAMP_TOURNAMENT_ID`: completed tournament missing champion/final winner (if available)

Validation targets:

1. **Champion emits once**
   - emitter returns `issued: true` (or `already_issued` if previously issued)
   - one trophy row exists for milestone key `tournament_complete:<tournament_id>:champion`
   - audit rows present for emitter/orchestrator

2. **Retry idempotent**
   - rerun returns `issued: false`, `reason: already_issued`
   - trophy count for same milestone key remains `1`
   - audit includes repeat outcome

3. **Incomplete/missing champion skips**
   - non-completed tournament returns skip reason (`tournament_not_completed`)
   - missing champion/final winner returns skip reason (`champion_missing` / `final_match_missing`)
   - no trophy rows for those milestone keys
   - audit includes `outcome = skipped`

Audit focus columns:

- `emitter` (`emit_trophy_for_tournament_champion`, `orchestrate_trophy_issuance`)
- `source_tournament_id`
- `milestone_key`
- `outcome` (`issued|already_issued|skipped|error`)
- `details` JSON payload

---

## 7. Prestige emission verification (foundation emitter)

Before running `PRESTIGE_EMISSION_VERIFICATION.sql`, run:

- `supabase/VERIFICATION_CANDIDATE_HELPERS.sql`
- Copy one user ID from:
  - **3A** -> `TROPHY_USER_ID`
  - **3B** -> `RELIC_ONLY_USER_ID`
  - **3C** -> `EMPTY_USER_ID`

Run `supabase/PRESTIGE_EMISSION_VERIFICATION.sql` after replacing placeholder user UUIDs:

- `TROPHY_USER_ID`: user with at least one trophy record
- `RELIC_ONLY_USER_ID`: user with no trophies and at least one vault relic
- `EMPTY_USER_ID`: user with neither trophies nor relics

Validation targets:

1. **Trophy path updates**
   - emitter returns updated/unchanged outcome
   - frame resolves to trophy-derived base state (`Honors Frame`, `laurel`, `bronze`)
   - `source_basis` evidence present with `rule_version = foundation_v1`
   - audit rows present

2. **Relic-only path updates**
   - emitter returns updated/unchanged outcome
   - frame resolves to relic-derived entry state (`Relic Frame`, `sigil`, `iron`)
   - audit rows present

3. **No-unlock skip**
   - emitter returns `updated: false` with `reason = no_unlock_signal`
   - no frame row created/changed for empty user
   - audit visibility present

4. **Repeat unchanged**
   - second call with unchanged source truth yields unchanged behavior
   - `updated_at` does not advance for identical computed state

Error visibility queries include:

- `emitter`
- `user_id`
- `outcome`
- `details` payload
- `source_basis.rule_version` where present

---

## 8. Profile identity verification (bio + avatar editing)

Run `supabase/PROFILE_IDENTITY_VERIFICATION.sql` to validate the editable profile identity foundation.

What this verifies:

1. **DB/profile fields**
   - `public.profiles.bio` exists
   - `public.profiles.avatar_path` exists
   - `public.update_own_profile_identity(text, text)` exists, is `SECURITY DEFINER`
   - RPC execute grants are restricted as expected (`authenticated` only)

2. **Storage bucket + policy posture**
   - bucket `profile-avatars` exists
   - bucket is configured for intended public read behavior
   - owner write/update/delete policies exist on `storage.objects`
   - policy text includes uid folder-prefix guard:
     - `(storage.foldername(name))[1] = auth.uid()::text`

3. **Public read-model exposure**
   - `get_public_profile_snapshot(<profile_id>)->'profile'` includes `bio` and `avatar_path`
   - no private account fields (like email) are included in the public profile payload

### 8.1 Manual UI checklist (dev/operator)

Use two browser sessions if possible (or signed-in + incognito):

1. **Bio save on self profile**
   - Sign in as test user A
   - Open `/profile`
   - Enter bio text and save
   - Reload `/profile` and confirm bio persists

2. **Avatar upload on self profile**
   - On `/profile`, upload a small image (png/jpeg/webp/gif)
   - Confirm avatar renders immediately on self profile
   - Confirm fallback initials are **not** shown while avatar exists

3. **Public profile render**
   - Open `/profile/<userA_id>`
   - Confirm public page displays:
     - updated bio text
     - uploaded avatar image

4. **Fallback behavior**
   - Clear avatar path for user A (or use a user B with no avatar)
   - Open `/profile` and `/profile/<id>`
   - Confirm initials avatar fallback is shown

5. **Ownership safety spot-check**
   - As user B, attempt to update user A identity fields through client flow
   - Expected: not possible through UI; update path is self-scoped only

Capture in ticket/audit:

- SQL output from sections 1-6 of `PROFILE_IDENTITY_VERIFICATION.sql`
- Screenshots for self `/profile` and public `/profile/<id>` after bio/avatar update
- Note any policy drift (missing prefix guard / unexpected grants)

---

## 9. Finished-game context drift cleanup (play_context reconciliation)

Use this when `/finished` reports excluded unknown-context rows or when historical free/tournament split looks incomplete.

Run:

- `supabase/FINISHED_CONTEXT_DRIFT_RECONCILIATION.sql`

### 9.1 What this pack checks

1. **Drift counts**
   - finished rows with missing `play_context`
   - finished rows with invalid `play_context` (not `free|tournament`)

2. **Candidate detail + signals**
   - `tournament_id`
   - `source_type` (e.g. `tournament_bracket`)
   - `mode` (`PIT` as possible tournament signal)

3. **Contradiction checks**
   - rows marked `free` but carrying tournament linkage
   - rows marked `tournament` but lacking tournament linkage signals

4. **Post-fix residual drift**
   - count of remaining missing/invalid finished rows

### 9.2 Safe classification guidance (operator)

Classify as **tournament** when one or more strong signals exist:

- `tournament_id` is not null
- `source_type` indicates tournament (`tournament_bracket`/`tournament`)

Classify as **free** only when:

- no tournament signals are present
- row context aligns with free-play lineage after spot review

If signals conflict or remain ambiguous:

- do not bulk-fix automatically
- isolate those IDs for manual decision with product/engineering review

### 9.3 Safe update procedure

1. Use section 3 of the SQL pack to gather candidate IDs.
2. Apply only explicit UUID lists via templates in section 4.
3. Run updates inside a transaction (`BEGIN ... RETURNING ... ROLLBACK`) first.
4. Replace `ROLLBACK` with `COMMIT` only after row-by-row review.
5. Re-run section 5 and confirm `remaining_drift_rows = 0` (or known exceptions documented).

### 9.4 Verify /finished alignment after correction

After DB correction:

1. Open `/finished` (all), `/finished?context=free`, `/finished?context=tournament`.
2. Confirm previously excluded corrected rows now appear in the expected section.
3. Confirm no active rows are shown (hub must remain finished-only).
4. Capture before/after drift counts in the ticket or audit record.
