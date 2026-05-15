# Supabase security baseline (ACCL)

Last updated: 2026-05-13 (migration `20260530120000_supabase_security_hardening.sql`).

This document records Security Advisor–style findings from **repo audit** plus fixes. Re-run the [Supabase Security Advisor](https://supabase.com/docs/guides/database/database-linter) on the **deployed** project after applying migrations.

## Operator checklist (Dashboard)

1. **Database → Security Advisor** — export or screenshot all warnings; map each to a row in [Findings](#findings) below.
2. **Authentication → API** — confirm anon key is publishable-only; service role never in client env.
3. **Authentication → JWT / API keys** — plan migration to signing keys; do **not** disable legacy JWT until SSR/middleware/Edge paths are verified (see [JWT / API keys](#jwt--api-keys)).
4. **Vercel → Environment Variables** — mark `ACCL_ANALYSIS_QUEUE_SECRET`, `ACCL_TOURNAMENT_OPS_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, Stripe secrets as **Sensitive** (not Development-only exposure).

## Findings (repo audit)

| ID | Severity | Area | Finding | Status |
|----|----------|------|---------|--------|
| S-01 | High | `tournament_entries_rw` / `tournament_matches_rw` | Foundation migration used `USING (true)` for all authenticated writes | **Fixed** — policies dropped in `20260530120000` |
| S-02 | High | `tournaments_update_authenticated` | `USING (true)` allowed any user to update any tournament | **Fixed** — dropped; `tournaments_update_creator` remains |
| S-03 | High | `tournament_bootstrap_round` | `GRANT EXECUTE` to `authenticated` allowed client bracket bootstrap | **Fixed** — `service_role` only |
| S-04 | High | `match_requests` | No RLS policies in repo migrations (table used from browser) | **Fixed** — inbox/open-listing policies added |
| S-05 | Medium | `profiles` | RLS not defined in repo migrations; clients `select` other users | **Mitigated** — RLS enabled; authenticated read-all for display; **app must not** `select` payout/compliance columns |
| S-06 | Medium | `payment_transactions` / webhooks / `payout_retry_queue` | RLS enabled but no deny policies in repo | **Fixed** — explicit deny `authenticated`/`anon` |
| S-07 | Low | `profiles_select_authenticated` | Any signed-in user can read all profile columns if they query `*` | **Accepted** — use column lists in client; prefer RPCs for public snapshots |
| S-08 | Info | Tester chat tables | `USING (true)` on `service_role` policies only | **OK** — role-scoped, not `authenticated` |
| S-09 | Info | Nexus announcements/events | Authenticated read active rows + service_role write | **OK** — intentional curated read |
| S-10 | Info | `games` lobby SELECT | Authenticated can read seated free lobby games for realtime | **OK** — `tournament_id is null` in policy |
| S-11 | High | `anti_cheat_enforcement_states` | RLS not enabled in repo | **Fixed** — `20260530130000` service_role only |
| S-12 | High | `anti_cheat_enforcement_override_history` | RLS not enabled in repo | **Fixed** — `20260530130000` service_role only |
| S-13 | High | `public.moves` | Legacy table, RLS disabled (Advisor) | **Fixed** — `20260530130000` service_role only if table exists; app uses `game_move_logs` |

## Intentionally accepted risks

- **Profiles:** Authenticated users may read other users’ rows for `id` / `username` / display fields. Financial columns (`legal_name`, `payout_eligibility_status`, etc.) exist on the same table — **never** include them in client `.select()` lists.
- **Public spectate RPCs:** `get_public_spectate_game_snapshot`, `get_public_finished_game_snapshot`, `game_public_route_hint` granted to `anon` — required for `/game/[id]?public=1`.
- **Tournament games:** Direct `games` SELECT only for white/black; tournament spectate uses public RPC path.

## Exposed surfaces (by design)

### Tables — authenticated client access

| Table | SELECT | INSERT | UPDATE | Notes |
|-------|--------|--------|--------|-------|
| `games` | Participant + free lobby/open-seat policies | Open-seat insert | Participant | Tournament: participant only |
| `game_move_logs` | Participant | Self as player | — | |
| `match_requests` | Inbox + open pending | Sender | Pending sender/recipient | |
| `profiles` | All rows | Self | Self | Column discipline in app |
| `tournaments` / entries / matches | Creator or entrant | Creator paths | Creator | Operator uses service_role |
| `player_ratings` | Own rows | — | — | |
| `trophy_records`, `vault_relic_records` | Own/public rules per migration | — | — | |
| `nexus_announcements`, `nexus_upcoming_events` | Active rows | — | — | |

### Tables — service_role only (no client)

`payment_transactions`, `payment_webhook_events`, `payout_retry_queue`, `finished_game_analysis_jobs`, `tester_chat_*`, `tester_dm_threads`, `moderator_queue`, `nexus_advisory_outputs`, `anti_cheat_enforcement_states`, `anti_cheat_enforcement_override_history`, `moves` (legacy, if present), operator tournament bootstrap.

### Functions — notable grants

| Function | anon | authenticated | service_role |
|----------|------|---------------|--------------|
| `tournament_bootstrap_round` | — | — | yes |
| `create_seated_game_guard` | — | yes | yes |
| `finish_game` | — | yes | yes |
| `get_public_spectate_game_snapshot` | yes | yes | — |
| `get_public_profile_snapshot` | yes | yes | — |

## Service-role containment (app)

- `SUPABASE_SERVICE_ROLE_KEY` is read only in `lib/supabaseServiceRoleClient.ts` and **server** callers (`app/api/**`, `lib/server/**`, `lib/nexus/*` loaders used from server components, workers).
- **Never** prefix with `NEXT_PUBLIC_`.
- `lib/supabaseServiceRoleClient.ts` rejects anon JWT and non–`service_role` role at startup.

## JWT / API keys

- Production should use Supabase **publishable** + **secret** keys where the project supports them.
- Legacy JWT anon/service keys remain valid until a dedicated migration test pass (login, middleware username gate, game page, Nexus).
- Do not rotate secrets unless exposure is confirmed; **do** mark Vercel vars Sensitive.

## Future migration guard (required)

For every new `public` table or client-facing function:

1. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
2. `REVOKE ALL ON ... FROM PUBLIC` (and `anon` if not intended).
3. `GRANT` only required privileges to `authenticated` / `service_role`.
4. Policies: **no** `USING (true)` on `authenticated` for sensitive data; scope by `auth.uid()` or membership.
5. `SECURITY DEFINER` functions: `REVOKE ALL FROM PUBLIC`; `GRANT EXECUTE` to minimal roles.
6. Document in this file if a table is intentionally world-readable.

## Verification (after deploy)

```bash
npm run typecheck
npm run build
npm run gate:operational-core   # needs .env.local
```

Manual smoke (staging):

- Login / logout
- Nexus load
- Free challenge create + accept
- Tournament detail as creator/entrant (RLS)
- Chat/DM via API (service_role)
- Trainer analyze on **finished** game OK; **active tournament** game blocked (`ACTIVE_TOURNAMENT`)

SQL pack: `supabase/MANUAL_VERIFICATION_PACK.sql`

## Security Advisor rerun

After `supabase db push` (or applying `20260530120000_supabase_security_hardening.sql`):

1. Dashboard → Database → Security Advisor → confirm `tournament_bootstrap_round` and permissive tournament policies warnings cleared.
2. Re-check any remaining **RLS disabled** or **policy always true** warnings; file new migration if found.
