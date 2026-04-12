-- Vault relic issuance: secure write path (foundation).
-- This pass intentionally does NOT implement milestone/reward rules.
-- It provides a trusted issuance pipe to be called later by server-side milestone handlers.

-- Defense-in-depth: keep vault records read-only for clients.
revoke insert, update, delete on table public.vault_relic_records from authenticated;
revoke insert, update, delete on table public.vault_relic_records from anon;
revoke insert, update, delete on table public.vault_relic_records from public;

create or replace function public.issue_vault_relic(
  p_user_id uuid,
  p_title text,
  p_category text,
  p_date_won timestamptz default null,
  p_source_game_id uuid default null,
  p_source_tournament_id uuid default null,
  p_pace text default null,
  p_description text default null
)
returns public.vault_relic_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_category text;
  v_pace text;
  v_row public.vault_relic_records%rowtype;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  v_title := trim(coalesce(p_title, ''));
  if v_title = '' then
    raise exception 'title is required';
  end if;

  v_category := lower(trim(coalesce(p_category, '')));
  if v_category not in ('free', 'tournament') then
    raise exception 'invalid category (must be free|tournament)';
  end if;

  v_pace := nullif(lower(trim(coalesce(p_pace, ''))), '');
  if v_pace is not null and v_pace not in ('live', 'daily', 'correspondence') then
    raise exception 'invalid pace (must be live|daily|correspondence|null)';
  end if;

  -- Optional lineage sanity checks:
  -- - free relics should not point at tournament source ids
  -- - tournament relics should not point at game source ids only
  -- Kept permissive for now (both nullable) so reward rules can decide strictness later.

  insert into public.vault_relic_records (
    user_id,
    title,
    category,
    date_won,
    source_game_id,
    source_tournament_id,
    pace,
    description
  )
  values (
    p_user_id,
    v_title,
    v_category,
    p_date_won,
    p_source_game_id,
    p_source_tournament_id,
    v_pace,
    nullif(trim(coalesce(p_description, '')), '')
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.issue_vault_relic(uuid, text, text, timestamptz, uuid, uuid, text, text) is
  'Trusted Vault relic issuance RPC. For server-side milestone handlers only; not for direct client creation.';

-- Future milestone integration guidance (deferred):
-- - game-finish milestone worker can call issue_vault_relic(...) with source_game_id set.
-- - tournament milestone worker can call issue_vault_relic(...) with source_tournament_id set.
-- - keep callers server-side (service_role) so issuance rules remain centralized and auditable.

revoke all on function public.issue_vault_relic(uuid, text, text, timestamptz, uuid, uuid, text, text) from public;
grant execute on function public.issue_vault_relic(uuid, text, text, timestamptz, uuid, uuid, text, text) to service_role;
