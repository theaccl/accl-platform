-- Phase 1I-a: bot_move_jobs queue foundation (infra only; no submit-move cutover).
-- Processor/submit integration deferred to 1I-b+; feature flag BOT_MOVE_QUEUE_ENABLED defaults off in app.

create table if not exists public.bot_move_jobs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  status text not null,
  post_human_fen text not null,
  bot_player_id uuid not null,
  idempotency_key text not null,
  selected_uci text,
  think_ms integer,
  attempt_count integer not null default 0,
  last_error text,
  correlation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  constraint bot_move_jobs_status_check check (
    status in ('queued', 'running', 'completed', 'failed', 'cancelled')
  ),
  constraint bot_move_jobs_idempotency_key_nonempty check (
    nullif(trim(coalesce(idempotency_key, '')), '') is not null
  ),
  constraint bot_move_jobs_post_human_fen_nonempty check (
    nullif(trim(coalesce(post_human_fen, '')), '') is not null
  )
);

create unique index if not exists bot_move_jobs_game_id_idempotency_key_uq
  on public.bot_move_jobs (game_id, idempotency_key);

create index if not exists bot_move_jobs_game_id_status_idx
  on public.bot_move_jobs (game_id, status);

create index if not exists bot_move_jobs_status_created_at_idx
  on public.bot_move_jobs (status, created_at asc);

comment on table public.bot_move_jobs is
  'Async bot-move work queue (Phase 1I). Commit path remains apply_bot_game_turn_system; worker not wired in 1I-a.';

alter table public.bot_move_jobs enable row level security;

revoke all on public.bot_move_jobs from public;
grant select, insert, update on public.bot_move_jobs to service_role;

create or replace function public.enqueue_bot_move_job(
  p_game_id uuid,
  p_post_human_fen text,
  p_bot_player_id uuid,
  p_idempotency_key text,
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
    correlation_id
  )
  values (
    p_game_id,
    'queued',
    v_fen,
    p_bot_player_id,
    v_key,
    nullif(trim(coalesce(p_correlation_id, '')), '')
  )
  on conflict (game_id, idempotency_key)
  do update set updated_at = public.bot_move_jobs.updated_at
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.enqueue_bot_move_job(uuid, text, uuid, text, text) is
  'Enqueue bot move work (deduped per game + idempotency_key). service_role only. Does not commit moves.';

revoke all on function public.enqueue_bot_move_job(uuid, text, uuid, text, text) from public;
grant execute on function public.enqueue_bot_move_job(uuid, text, uuid, text, text) to service_role;

create or replace function public.claim_next_bot_move_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select q.id
    into v_id
  from public.bot_move_jobs q
  where q.status = 'queued'
  order by q.created_at asc
  for update skip locked
  limit 1;

  if v_id is null then
    return null;
  end if;

  update public.bot_move_jobs j
  set
    status = 'running',
    attempt_count = j.attempt_count + 1,
    claimed_at = now(),
    updated_at = now()
  where j.id = v_id;

  return (
    select to_jsonb(r)
    from public.bot_move_jobs r
    where r.id = v_id
  );
end;
$$;

comment on function public.claim_next_bot_move_job() is
  'Atomically claim one queued bot_move_job (SKIP LOCKED). service_role only.';

revoke all on function public.claim_next_bot_move_job() from public;
grant execute on function public.claim_next_bot_move_job() to service_role;

create or replace function public.complete_bot_move_job(
  p_job_id uuid,
  p_selected_uci text,
  p_think_ms integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uci text;
begin
  if p_job_id is null then
    raise exception 'job_id_required';
  end if;

  v_uci := nullif(trim(coalesce(p_selected_uci, '')), '');
  if v_uci is null then
    raise exception 'selected_uci_required';
  end if;

  update public.bot_move_jobs
  set
    status = 'completed',
    selected_uci = v_uci,
    think_ms = p_think_ms,
    completed_at = now(),
    updated_at = now(),
    last_error = null
  where id = p_job_id
    and status = 'running';

  return found;
end;
$$;

comment on function public.complete_bot_move_job(uuid, text, integer) is
  'Finalize a running bot_move_job as completed. service_role only.';

revoke all on function public.complete_bot_move_job(uuid, text, integer) from public;
grant execute on function public.complete_bot_move_job(uuid, text, integer) to service_role;

create or replace function public.fail_bot_move_job(
  p_job_id uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_job_id is null then
    raise exception 'job_id_required';
  end if;

  update public.bot_move_jobs
  set
    status = 'failed',
    last_error = nullif(trim(coalesce(p_error, '')), ''),
    updated_at = now()
  where id = p_job_id
    and status in ('queued', 'running');

  return found;
end;
$$;

comment on function public.fail_bot_move_job(uuid, text) is
  'Mark a bot_move_job failed (from queued or running). service_role only.';

revoke all on function public.fail_bot_move_job(uuid, text) from public;
grant execute on function public.fail_bot_move_job(uuid, text) to service_role;

create or replace function public.fail_stale_running_bot_move_jobs(
  p_stale_after_seconds integer default 120,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seconds int := greatest(30, coalesce(p_stale_after_seconds, 120));
  v_limit int := greatest(1, least(coalesce(p_limit, 100), 1000));
begin
  return (
    with stale as (
      select j.id
      from public.bot_move_jobs j
      where j.status = 'running'
        and coalesce(j.claimed_at, j.updated_at) < (now() - make_interval(secs => v_seconds))
      order by j.updated_at asc
      for update skip locked
      limit v_limit
    ),
    upd as (
      update public.bot_move_jobs j
      set
        status = 'failed',
        last_error = format('stale running timeout after %s seconds', v_seconds),
        updated_at = now()
      from stale s
      where j.id = s.id
      returning j.id
    )
    select jsonb_build_object(
      'stale_after_seconds', v_seconds,
      'limit', v_limit,
      'updated_count', (select count(*)::int from upd),
      'job_ids', coalesce((select jsonb_agg(u.id) from upd u), '[]'::jsonb)
    )
  );
end;
$$;

comment on function public.fail_stale_running_bot_move_jobs(integer, integer) is
  'Ops recovery: mark stale running bot_move_jobs as failed. service_role only.';

revoke all on function public.fail_stale_running_bot_move_jobs(integer, integer) from public;
grant execute on function public.fail_stale_running_bot_move_jobs(integer, integer) to service_role;

create or replace function public.get_bot_move_job_for_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bot_move_jobs%rowtype;
begin
  if p_game_id is null then
    raise exception 'game_id_required';
  end if;

  select * into v_row
  from public.bot_move_jobs
  where game_id = p_game_id
  order by created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  return to_jsonb(v_row);
end;
$$;

comment on function public.get_bot_move_job_for_game(uuid) is
  'Latest bot_move_job row for a game (poll helper). service_role only.';

revoke all on function public.get_bot_move_job_for_game(uuid) from public;
grant execute on function public.get_bot_move_job_for_game(uuid) to service_role;
