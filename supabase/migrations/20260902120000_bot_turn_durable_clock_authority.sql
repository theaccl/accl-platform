-- PR #52 T3: durable bot-turn reservation and atomic bot-clock authority.
--
-- The human ply and its recovery job are committed in one transaction. The
-- bot ply (or timeout) and job completion are likewise committed together.

begin;

create or replace function public.reserve_bot_game_turn_system(
  p_game_id uuid,
  p_expected_fen text,
  p_human_next_fen text,
  p_human_next_turn text,
  p_human_last_move_at timestamptz,
  p_human_move_deadline_at timestamptz,
  p_human_white_clock_ms integer,
  p_human_black_clock_ms integer,
  p_human_promote_waiting_to_active boolean,
  p_human_move_log jsonb,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $reserve_bot_turn$
declare
  g public.games%rowtype;
  j public.bot_move_jobs%rowtype;
  v_human_idem text;
  v_bot_player_id uuid;
begin
  if p_game_id is null then
    raise exception 'game_id_required';
  end if;
  if p_human_move_log is null or jsonb_typeof(p_human_move_log) <> 'object' then
    raise exception 'move_log_invalid_payload';
  end if;

  v_human_idem := nullif(trim(coalesce(p_human_move_log->>'idempotency_key', '')), '');
  if v_human_idem is null then
    raise exception 'idempotency_key_required';
  end if;

  -- A completed reservation is an idempotent success even after the board has
  -- advanced beyond the human FEN.
  select * into j
  from public.bot_move_jobs
  where game_id = p_game_id
    and idempotency_key = v_human_idem
  for update;

  if found then
    if j.post_human_fen is distinct from p_human_next_fen then
      raise exception 'idempotency_key_conflict';
    end if;
    select * into g from public.games where id = p_game_id for update;
    if not found then
      raise exception 'game_not_found';
    end if;
    return jsonb_build_object(
      'game', to_jsonb(g),
      'job_id', j.id,
      'job_status', j.status,
      'job_attempt_count', j.attempt_count
    );
  end if;

  g := public.apply_bot_game_turn_system(
    p_game_id,
    p_expected_fen,
    p_human_next_fen,
    p_human_next_turn,
    p_human_last_move_at,
    p_human_move_deadline_at,
    p_human_white_clock_ms,
    p_human_black_clock_ms,
    p_human_promote_waiting_to_active,
    null,
    null,
    p_human_move_log,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  );

  if coalesce(g.play_context, 'free') is distinct from 'free'
     or g.tournament_id is not null then
    raise exception 'bot_turn_tournament_forbidden';
  end if;
  if g.status is distinct from 'active' then
    raise exception 'game_not_playable';
  end if;
  if lower(trim(coalesce(g.turn, ''))) = 'white' then
    v_bot_player_id := g.white_player_id;
  elsif lower(trim(coalesce(g.turn, ''))) = 'black' then
    v_bot_player_id := g.black_player_id;
  else
    raise exception 'next_turn_required';
  end if;
  if v_bot_player_id is null then
    raise exception 'bot_player_id_required';
  end if;

  insert into public.bot_move_jobs (
    game_id,
    status,
    post_human_fen,
    bot_player_id,
    idempotency_key,
    correlation_id
  )
  values (
    p_game_id,
    'queued',
    p_human_next_fen,
    v_bot_player_id,
    v_human_idem,
    nullif(trim(coalesce(p_correlation_id, '')), '')
  )
  on conflict (game_id, idempotency_key)
  do update set updated_at = public.bot_move_jobs.updated_at
  returning * into j;

  return jsonb_build_object(
    'game', to_jsonb(g),
    'job_id', j.id,
    'job_status', j.status,
    'job_attempt_count', j.attempt_count
  );
end;
$reserve_bot_turn$;

comment on function public.reserve_bot_game_turn_system(
  uuid, text, text, text, timestamptz, timestamptz, integer, integer, boolean, jsonb, text
) is 'Atomically commits an idempotent human bot-game ply and its durable bot-turn recovery job.';

revoke all on function public.reserve_bot_game_turn_system(
  uuid, text, text, text, timestamptz, timestamptz, integer, integer, boolean, jsonb, text
) from public, anon, authenticated;
grant execute on function public.reserve_bot_game_turn_system(
  uuid, text, text, text, timestamptz, timestamptz, integer, integer, boolean, jsonb, text
) to service_role;

create or replace function public.bot_turn_flagged_loser(
  p_tempo text,
  p_status text,
  p_turn text,
  p_last_move_at timestamptz,
  p_white_clock_ms bigint,
  p_black_clock_ms bigint,
  p_live_time_control text,
  p_now timestamptz
)
returns text
language plpgsql
stable
set search_path = ''
as $bot_turn_clock$
declare
  v_tempo text := lower(trim(coalesce(p_tempo, '')));
  v_turn text := lower(trim(coalesce(p_turn, '')));
  v_token text := lower(trim(coalesce(p_live_time_control, '')));
  v_base bigint;
  v_stored bigint;
  v_elapsed bigint;
begin
  if v_tempo not in ('live', 'daily')
     or lower(trim(coalesce(p_status, ''))) <> 'active'
     or p_last_move_at is null
     or v_turn not in ('white', 'black') then
    return null;
  end if;

  v_base := case
    when v_tempo = 'daily'
      and v_token !~ '^([0-9]+d|[0-9]+\+[0-9]+|[0-9]+m)$'
      then 30::bigint * 60000
    else public.clock_budget_ms_for_live_sweep(p_live_time_control)
  end;
  v_stored := case v_turn
    when 'white' then coalesce(p_white_clock_ms, v_base)
    else coalesce(p_black_clock_ms, v_base)
  end;
  v_elapsed := greatest(
    0,
    (extract(epoch from (p_now - p_last_move_at)) * 1000)::bigint
  );

  if v_stored - v_elapsed <= 0 then
    return v_turn;
  end if;
  return null;
end;
$bot_turn_clock$;

comment on function public.bot_turn_flagged_loser(
  text, text, text, timestamptz, bigint, bigint, text, timestamptz
) is 'Returns the expired side for an active live/daily bot turn; null otherwise.';

revoke all on function public.bot_turn_flagged_loser(
  text, text, text, timestamptz, bigint, bigint, text, timestamptz
) from public, anon, authenticated;

create or replace function public.apply_queued_bot_move_system(
  p_job_id uuid,
  p_claim_attempt_count integer,
  p_selected_uci text,
  p_think_ms integer,
  p_bot_next_fen text,
  p_bot_next_turn text,
  p_bot_last_move_at timestamptz,
  p_bot_move_deadline_at timestamptz,
  p_bot_white_clock_ms integer,
  p_bot_black_clock_ms integer,
  p_bot_result text,
  p_bot_end_reason text,
  p_bot_move_log jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $apply_queued_bot_move$
declare
  j public.bot_move_jobs%rowtype;
  g public.games%rowtype;
  h public.game_move_logs%rowtype;
  v_flagged text;
  v_timeout_result text;
  v_bot_idem text;
  v_existing_bot_log public.game_move_logs%rowtype;
begin
  if p_job_id is null then
    raise exception 'job_id_required';
  end if;

  select * into j
  from public.bot_move_jobs
  where id = p_job_id
  for update;
  if not found then
    raise exception 'bot_job_not_found';
  end if;

  select * into g
  from public.games
  where id = j.game_id
  for update;
  if not found then
    raise exception 'game_not_found';
  end if;

  if j.status = 'cancelled' then
    raise exception 'bot_job_cancelled';
  end if;

  if j.status = 'completed' then
    return jsonb_build_object(
      'game', to_jsonb(g),
      'bot_move_applied', false,
      'timed_out', j.last_error = 'bot_clock_expired',
      'job_status', j.status
    );
  end if;
  if j.attempt_count is distinct from p_claim_attempt_count then
    raise exception 'bot_job_claim_lost';
  end if;
  if j.status not in ('queued', 'running') then
    raise exception 'bot_job_not_processable';
  end if;
  if coalesce(g.source_type, '') is distinct from 'bot_game' then
    raise exception 'not_bot_game';
  end if;
  if coalesce(g.play_context, 'free') is distinct from 'free'
     or g.tournament_id is not null then
    raise exception 'bot_turn_tournament_forbidden';
  end if;

  if g.status is distinct from 'active' then
    update public.bot_move_jobs
    set status = 'cancelled', last_error = 'game_not_active', updated_at = clock_timestamp()
    where id = j.id;
    return jsonb_build_object(
      'game', to_jsonb(g),
      'bot_move_applied', false,
      'timed_out', false,
      'job_status', 'cancelled'
    );
  end if;

  v_bot_idem := nullif(trim(coalesce(p_bot_move_log->>'idempotency_key', '')), '');
  if v_bot_idem is not null then
    select * into v_existing_bot_log
    from public.game_move_logs
    where game_id = j.game_id
      and idempotency_key = v_bot_idem
    limit 1;
    if found and g.fen is not distinct from v_existing_bot_log.fen_after then
      update public.bot_move_jobs
      set
        status = 'completed',
        selected_uci = nullif(trim(coalesce(p_selected_uci, '')), ''),
        think_ms = p_think_ms,
        completed_at = coalesce(completed_at, clock_timestamp()),
        updated_at = clock_timestamp(),
        last_error = null
      where id = j.id;
      return jsonb_build_object(
        'game', to_jsonb(g),
        'bot_move_applied', true,
        'timed_out', false,
        'job_status', 'completed'
      );
    end if;
  end if;

  if g.fen is distinct from j.post_human_fen then
    raise exception 'optimistic_conflict';
  end if;
  if (lower(trim(coalesce(g.turn, ''))) = 'white' and g.white_player_id is distinct from j.bot_player_id)
     or (lower(trim(coalesce(g.turn, ''))) = 'black' and g.black_player_id is distinct from j.bot_player_id)
     or lower(trim(coalesce(g.turn, ''))) not in ('white', 'black') then
    raise exception 'bot_turn_mismatch';
  end if;

  v_flagged := public.bot_turn_flagged_loser(
    g.tempo,
    g.status,
    g.turn,
    g.last_move_at,
    g.white_clock_ms,
    g.black_clock_ms,
    g.live_time_control,
    clock_timestamp()
  );
  if v_flagged is not null then
    v_timeout_result := case v_flagged when 'white' then 'black_win' else 'white_win' end;
    g := public.finish_game_system(j.game_id, v_timeout_result, 'timeout');
    update public.bot_move_jobs
    set
      status = 'completed',
      selected_uci = null,
      think_ms = p_think_ms,
      completed_at = clock_timestamp(),
      updated_at = clock_timestamp(),
      last_error = 'bot_clock_expired'
    where id = j.id;
    return jsonb_build_object(
      'game', to_jsonb(g),
      'bot_move_applied', false,
      'timed_out', true,
      'job_status', 'completed'
    );
  end if;

  if nullif(trim(coalesce(p_selected_uci, '')), '') is null
     or nullif(trim(coalesce(p_bot_next_fen, '')), '') is null
     or lower(trim(coalesce(p_bot_next_turn, ''))) not in ('white', 'black')
     or p_bot_move_log is null
     or jsonb_typeof(p_bot_move_log) <> 'object' then
    raise exception 'bot_move_payload_required';
  end if;

  select * into h
  from public.game_move_logs
  where game_id = j.game_id
    and idempotency_key = j.idempotency_key
  limit 1;
  if not found then
    raise exception 'human_move_log_not_found';
  end if;

  g := public.apply_bot_game_turn_system(
    j.game_id,
    h.fen_before,
    j.post_human_fen,
    g.turn,
    g.last_move_at,
    g.move_deadline_at,
    g.white_clock_ms,
    g.black_clock_ms,
    false,
    null,
    null,
    jsonb_build_object(
      'game_id', h.game_id,
      'player_id', h.player_id,
      'san', h.san,
      'from_sq', h.from_sq,
      'to_sq', h.to_sq,
      'fen_before', h.fen_before,
      'fen_after', h.fen_after,
      'move_duration_ms', h.move_duration_ms,
      'idempotency_key', h.idempotency_key
    ),
    p_bot_next_fen,
    p_bot_next_turn,
    p_bot_last_move_at,
    p_bot_move_deadline_at,
    p_bot_white_clock_ms,
    p_bot_black_clock_ms,
    p_bot_result,
    p_bot_end_reason,
    p_bot_move_log
  );

  update public.bot_move_jobs
  set
    status = 'completed',
    selected_uci = nullif(trim(coalesce(p_selected_uci, '')), ''),
    think_ms = p_think_ms,
    completed_at = clock_timestamp(),
    updated_at = clock_timestamp(),
    last_error = null
  where id = j.id;

  return jsonb_build_object(
    'game', to_jsonb(g),
    'bot_move_applied', true,
    'timed_out', false,
    'job_status', 'completed'
  );
end;
$apply_queued_bot_move$;

comment on function public.apply_queued_bot_move_system(
  uuid, integer, text, integer, text, text, timestamptz, timestamptz, integer, integer, text, text, jsonb
) is 'Atomically applies a reserved bot move or records its clock timeout, then completes the recovery job.';

revoke all on function public.apply_queued_bot_move_system(
  uuid, integer, text, integer, text, text, timestamptz, timestamptz, integer, integer, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_queued_bot_move_system(
  uuid, integer, text, integer, text, text, timestamptz, timestamptz, integer, integer, text, text, jsonb
) to service_role;

create or replace function public.claim_next_bot_move_job()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $claim_bot_job$
declare
  v_id uuid;
begin
  select q.id
    into v_id
  from public.bot_move_jobs q
  where q.status = 'queued'
    and q.attempt_count < 5
  order by q.updated_at asc, q.created_at asc
  for update skip locked
  limit 1;

  if v_id is null then
    return null;
  end if;

  update public.bot_move_jobs j
  set
    status = 'running',
    attempt_count = j.attempt_count + 1,
    claimed_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where j.id = v_id;

  return (
    select to_jsonb(r)
    from public.bot_move_jobs r
    where r.id = v_id
  );
end;
$claim_bot_job$;

revoke all on function public.claim_next_bot_move_job() from public, anon, authenticated;
grant execute on function public.claim_next_bot_move_job() to service_role;

drop function if exists public.release_bot_move_job(uuid, text);

create or replace function public.release_bot_move_job(
  p_job_id uuid,
  p_claim_attempt_count integer,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $release_bot_job$
begin
  update public.bot_move_jobs
  set
    status = case when attempt_count >= 5 then 'failed' else 'queued' end,
    claimed_at = null,
    last_error = nullif(trim(coalesce(p_error, '')), ''),
    updated_at = clock_timestamp()
  where id = p_job_id
    and status = 'running'
    and attempt_count = p_claim_attempt_count;
  return found;
end;
$release_bot_job$;

drop function if exists public.cancel_bot_move_job(uuid, text);

create or replace function public.cancel_bot_move_job(
  p_job_id uuid,
  p_claim_attempt_count integer,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $cancel_bot_job$
begin
  update public.bot_move_jobs
  set
    status = 'cancelled',
    claimed_at = null,
    last_error = nullif(trim(coalesce(p_reason, '')), ''),
    updated_at = clock_timestamp()
  where id = p_job_id
    and status = 'running'
    and attempt_count = p_claim_attempt_count;
  return found;
end;
$cancel_bot_job$;

create or replace function public.recover_stale_bot_move_jobs(
  p_stale_after_seconds integer default 120,
  p_limit integer default 25
)
returns integer
language plpgsql
security definer
set search_path = ''
as $recover_bot_jobs$
declare
  v_seconds integer := greatest(30, coalesce(p_stale_after_seconds, 120));
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_count integer;
begin
  with stale as (
    select id
    from public.bot_move_jobs
    where status = 'running'
      and coalesce(claimed_at, updated_at) < clock_timestamp() - make_interval(secs => v_seconds)
    order by updated_at asc
    limit v_limit
    for update skip locked
  ), recovered as (
    update public.bot_move_jobs j
    set
      status = case when j.attempt_count >= 5 then 'failed' else 'queued' end,
      claimed_at = null,
      last_error = 'stale_worker_recovered',
      updated_at = clock_timestamp()
    from stale s
    where j.id = s.id
    returning j.id
  )
  select count(*)::integer into v_count from recovered;
  return coalesce(v_count, 0);
end;
$recover_bot_jobs$;

revoke all on function public.release_bot_move_job(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.release_bot_move_job(uuid, integer, text) to service_role;
revoke all on function public.cancel_bot_move_job(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.cancel_bot_move_job(uuid, integer, text) to service_role;
revoke all on function public.recover_stale_bot_move_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.recover_stale_bot_move_jobs(integer, integer) to service_role;

comment on function public.release_bot_move_job(uuid, integer, text) is
  'Requeues a recoverable bot job with fair ordering, or marks it failed after five claims.';
comment on function public.cancel_bot_move_job(uuid, integer, text) is
  'Cancels a queued/running bot job whose game no longer permits a bot move.';
comment on function public.recover_stale_bot_move_jobs(integer, integer) is
  'Requeues stale running bot jobs, failing exhausted jobs so poison work cannot starve the queue.';

commit;
