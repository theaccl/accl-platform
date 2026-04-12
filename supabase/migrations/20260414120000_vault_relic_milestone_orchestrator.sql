-- Vault milestone issuance orchestrator (trusted, idempotent).
-- Builds a server-side handoff that calls issue_vault_relic(...) with duplicate shielding.

alter table public.vault_relic_records
  add column if not exists milestone_key text null;

alter table public.vault_relic_records
  drop constraint if exists vault_relic_records_milestone_key_not_blank;

alter table public.vault_relic_records
  add constraint vault_relic_records_milestone_key_not_blank check (
    milestone_key is null or btrim(milestone_key) <> ''
  );

comment on column public.vault_relic_records.milestone_key is
  'Idempotency key from trusted milestone orchestrator (e.g. game_finish:uuid, tournament_place:uuid:1).';

create unique index if not exists vault_relic_records_user_milestone_key_uidx
  on public.vault_relic_records (user_id, milestone_key)
  where milestone_key is not null;

create or replace function public.orchestrate_vault_relic_issuance(
  p_user_id uuid,
  p_milestone_key text,
  p_title text,
  p_category text,
  p_date_won timestamptz default null,
  p_source_game_id uuid default null,
  p_source_tournament_id uuid default null,
  p_pace text default null,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_row public.vault_relic_records%rowtype;
  v_created public.vault_relic_records%rowtype;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  v_key := lower(trim(coalesce(p_milestone_key, '')));
  if v_key = '' then
    raise exception 'milestone_key is required';
  end if;

  -- Fast-path idempotency check.
  select *
    into v_row
  from public.vault_relic_records
  where user_id = p_user_id
    and milestone_key = v_key
  limit 1;

  if found then
    return jsonb_build_object(
      'issued', false,
      'reason', 'already_issued',
      'relic_id', v_row.id,
      'milestone_key', v_row.milestone_key
    );
  end if;

  -- Trusted write path funnels through existing issuance RPC.
  select *
    into v_created
  from public.issue_vault_relic(
    p_user_id,
    p_title,
    p_category,
    p_date_won,
    p_source_game_id,
    p_source_tournament_id,
    p_pace,
    p_description
  );

  begin
    update public.vault_relic_records
    set milestone_key = v_key
    where id = v_created.id
    returning * into v_created;
  exception
    when unique_violation then
      -- Concurrent duplicate: reuse first-issued record and return deterministic "already_issued".
      select *
        into v_row
      from public.vault_relic_records
      where user_id = p_user_id
        and milestone_key = v_key
      limit 1;

      return jsonb_build_object(
        'issued', false,
        'reason', 'already_issued',
        'relic_id', v_row.id,
        'milestone_key', v_row.milestone_key
      );
  end;

  return jsonb_build_object(
    'issued', true,
    'reason', 'ok',
    'relic_id', v_created.id,
    'milestone_key', v_created.milestone_key
  );
end;
$$;

comment on function public.orchestrate_vault_relic_issuance(
  uuid, text, text, text, timestamptz, uuid, uuid, text, text
) is
  'Trusted milestone-to-relic orchestrator. Idempotent by (user_id, milestone_key); calls issue_vault_relic internally.';

-- Milestone event contract (deferred callers):
-- {
--   user_id: uuid,
--   milestone_key: text,           -- stable idempotency key, e.g. "game_finish:<game_id>:first_win"
--   title: text,
--   category: "free"|"tournament",
--   date_won?: timestamptz,
--   source_game_id?: uuid|null,
--   source_tournament_id?: uuid|null,
--   pace?: "live"|"daily"|"correspondence"|null,
--   description?: text|null
-- }

revoke all on function public.orchestrate_vault_relic_issuance(
  uuid, text, text, text, timestamptz, uuid, uuid, text, text
) from public;

grant execute on function public.orchestrate_vault_relic_issuance(
  uuid, text, text, text, timestamptz, uuid, uuid, text, text
) to service_role;
