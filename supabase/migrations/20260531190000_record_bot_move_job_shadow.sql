-- Phase 1I-b: audit-parity shadow row (completed) without queue worker or claim step.

create or replace function public.record_bot_move_job_shadow_system(
  p_game_id uuid,
  p_post_human_fen text,
  p_bot_player_id uuid,
  p_idempotency_key text,
  p_selected_uci text,
  p_think_ms integer default null,
  p_correlation_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_fen text;
  v_key text;
  v_uci text;
  g public.games%rowtype;
begin
  if p_game_id is null then
    raise exception 'game_id_required';
  end if;

  v_fen := nullif(trim(coalesce(p_post_human_fen, '')), '');
  if v_fen is null then
    raise exception 'post_human_fen_required';
  end if;

  if p_bot_player_id is null then
    raise exception 'bot_player_id_required';
  end if;

  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  if v_key is null then
    raise exception 'idempotency_key_required';
  end if;

  v_uci := nullif(trim(coalesce(p_selected_uci, '')), '');
  if v_uci is null then
    raise exception 'selected_uci_required';
  end if;

  select * into g from public.games where id = p_game_id;
  if not found then
    raise exception 'game_not_found';
  end if;

  if coalesce(g.source_type, '') is distinct from 'bot_game' then
    raise exception 'not_bot_game';
  end if;

  insert into public.bot_move_jobs (
    game_id,
    status,
    post_human_fen,
    bot_player_id,
    idempotency_key,
    selected_uci,
    think_ms,
    correlation_id,
    completed_at
  )
  values (
    p_game_id,
    'completed',
    v_fen,
    p_bot_player_id,
    v_key,
    v_uci,
    p_think_ms,
    nullif(trim(coalesce(p_correlation_id, '')), ''),
    now()
  )
  on conflict (game_id, idempotency_key)
  do update set
    status = 'completed',
    post_human_fen = excluded.post_human_fen,
    bot_player_id = excluded.bot_player_id,
    selected_uci = excluded.selected_uci,
    think_ms = excluded.think_ms,
    correlation_id = coalesce(excluded.correlation_id, public.bot_move_jobs.correlation_id),
    completed_at = coalesce(public.bot_move_jobs.completed_at, now()),
    updated_at = now(),
    last_error = null
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.record_bot_move_job_shadow_system(
  uuid,
  text,
  uuid,
  text,
  text,
  integer,
  text
) is 'Phase 1I-b shadow audit: upsert completed bot_move_jobs row (non-authoritative).';

revoke all on function public.record_bot_move_job_shadow_system(
  uuid,
  text,
  uuid,
  text,
  text,
  integer,
  text
) from public;

grant execute on function public.record_bot_move_job_shadow_system(
  uuid,
  text,
  uuid,
  text,
  text,
  integer,
  text
) to service_role;
