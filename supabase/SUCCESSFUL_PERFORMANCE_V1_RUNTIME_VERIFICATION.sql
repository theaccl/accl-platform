-- Successful Performance v1 — runtime behavioral verification (non-production only)
-- Prerequisite: 20260705120000_successful_performance_read_foundation.sql applied.
-- DO NOT run against production project nlptviibefbzisyqswuv.
--
-- Usage (authorized non-production only; requires psql — contains meta-commands):
--   psql "$NON_PRODUCTION_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/SUCCESSFUL_PERFORMANCE_V1_RUNTIME_VERIFICATION.sql
--
-- Entire fixture body rolls back; no persistent test data.
-- Fixture INSERT/UPDATE/DELETE run as the captured session owner role.
-- Simulated authenticated role is active only during RPC invocation.

\set ON_ERROR_STOP on

do $guard$
begin
  if to_regprocedure('public.get_own_successful_performance()') is null then
    raise exception using
      errcode = 'P0001',
      message = 'SPV1_PREREQUISITE_FAILED: apply 20260705120000_successful_performance_read_foundation.sql first';
  end if;
  raise notice 'PREREQUISITE OK: get_own_successful_performance() exists';
end;
$guard$;

begin;

-- Capture session owner role once; never hard-code postgres restoration.
select set_config('spv1.owner_role', current_user, true);

create temp table spv1_assertions (
  section text not null,
  name text not null,
  passed boolean not null,
  detail text
) on commit drop;

create or replace function pg_temp.spv1_assert(
  p_section text,
  p_name text,
  p_ok boolean,
  p_detail text default null
)
returns void
language plpgsql
as $$
begin
  if not p_ok then
    raise exception using
      errcode = 'SP001',
      message = format(
        'SPV1_ASSERTION_FAILED: [%s] %s — %s',
        p_section,
        p_name,
        coalesce(p_detail, 'assertion false')
      );
  end if;

  insert into spv1_assertions(section, name, passed, detail)
  values (p_section, p_name, true, p_detail);
  raise notice '[%] % OK', p_section, p_name;
end;
$$;

create or replace function pg_temp.spv1_as_owner()
returns void
language plpgsql
as $$
begin
  perform set_config(
    'role',
    coalesce(nullif(current_setting('spv1.owner_role', true), ''), current_user),
    true
  );
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function pg_temp.spv1_invoke_rpc(p_uid uuid)
returns jsonb
language plpgsql
as $$
declare
  v_payload jsonb;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_uid::text,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    true
  );

  v_payload := public.get_own_successful_performance();

  perform pg_temp.spv1_as_owner();
  return v_payload;
end;
$$;

create or replace function pg_temp.spv1_require_column(
  p_schema text,
  p_table text,
  p_column text
)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = p_schema
      and c.table_name = p_table
      and c.column_name = p_column
  ) then
    raise exception using
      errcode = 'P0001',
      message = format(
        'SPV1_PREREQUISITE_FAILED: missing column %I.%I.%I',
        p_schema,
        p_table,
        p_column
      );
  end if;
end;
$$;

create or replace function pg_temp.spv1_require_table(p_schema text, p_table text)
returns void
language plpgsql
as $$
begin
  if to_regclass(format('%I.%I', p_schema, p_table)) is null then
    raise exception using
      errcode = 'P0001',
      message = format('SPV1_PREREQUISITE_FAILED: missing table %I.%I', p_schema, p_table);
  end if;
end;
$$;

create or replace function pg_temp.spv1_exact_cell(
  p_payload jsonb,
  p_mode text,
  p_color text,
  p_control text
)
returns jsonb
language sql
as $$
  select elem
  from jsonb_array_elements(coalesce(p_payload->'free_play'->'exact_controls', '[]'::jsonb)) elem
  where elem->>'mode' = p_mode
    and elem->>'color' = p_color
    and elem->>'exact_control' = p_control
  limit 1;
$$;

create or replace function pg_temp.spv1_mode_cell(p_payload jsonb, p_mode text, p_color text)
returns jsonb
language sql
as $$
  select elem
  from jsonb_array_elements(coalesce(p_payload->'free_play'->'modes', '[]'::jsonb)) elem
  where elem->>'mode' = p_mode
    and elem->>'color' = p_color
  limit 1;
$$;

create or replace function pg_temp.spv1_create_user(p_suffix text)
returns uuid
language plpgsql
as $$
declare
  v_uid uuid := gen_random_uuid();
  v_email text := format('spv1_%s_%s@test.invalid', p_suffix, substr(v_uid::text, 1, 8));
  v_username text := format('spv1_%s_%s', p_suffix, substr(replace(v_uid::text, '-', ''), 1, 10));
begin
  perform pg_temp.spv1_as_owner();

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_uid,
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt('spv1fixturepass', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

  insert into public.profiles (id, username, email)
  values (v_uid, v_username, v_email)
  on conflict (id) do nothing;

  return v_uid;
end;
$$;

create or replace function pg_temp.spv1_insert_game(
  p_white uuid,
  p_black uuid,
  p_result text,
  p_end_reason text,
  p_play_context text,
  p_tempo text,
  p_ltc text,
  p_rated boolean,
  p_source_type text,
  p_bot_settings jsonb,
  p_tournament_id uuid,
  p_with_move boolean
)
returns uuid
language plpgsql
as $$
declare
  v_game_id uuid := gen_random_uuid();
  v_now timestamptz := now();
begin
  perform pg_temp.spv1_as_owner();

  insert into public.games (
    id,
    white_player_id,
    black_player_id,
    status,
    fen,
    turn,
    result,
    end_reason,
    source_type,
    play_context,
    mode,
    rated,
    tempo,
    live_time_control,
    bot_settings,
    tournament_id,
    ecosystem_scope,
    finished_at,
    last_move_at,
    created_at,
    updated_at
  ) values (
    v_game_id,
    p_white,
    p_black,
    'finished',
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'white',
    p_result,
    p_end_reason,
    p_source_type,
    p_play_context,
    'SKETCH',
    p_rated,
    p_tempo,
    p_ltc,
    p_bot_settings,
    p_tournament_id,
    'adult',
    v_now,
    v_now,
    v_now,
    v_now
  );

  if p_with_move then
    insert into public.game_move_logs (game_id, player_id, san)
    values (v_game_id, p_white, 'e4');
  end if;

  return v_game_id;
end;
$$;

do $main$
declare
  u_a uuid;
  u_b uuid;
  u_c uuid;
  t_a uuid;
  t_b uuid;
  v_rpc jsonb;
  v_cell jsonb;
  v_text text;
  v_game uuid;
  v_i int;
  v_public_execute boolean;
  v_first jsonb;
  v_second jsonb;
  v_identity_args text;
  v_col text;
  v_constraint text;
  v_a_games int;
  v_b_games int;
  v_has_play_context_check boolean;
begin
  perform pg_temp.spv1_as_owner();

  -- -------------------------------------------------------------------------
  -- TARGET SCHEMA PREFLIGHT
  -- -------------------------------------------------------------------------
  perform pg_temp.spv1_require_table('public', 'profiles');
  perform pg_temp.spv1_require_column('public', 'profiles', 'id');
  perform pg_temp.spv1_require_column('public', 'profiles', 'email');
  perform pg_temp.spv1_require_column('public', 'profiles', 'username');

  perform pg_temp.spv1_require_table('auth', 'users');
  perform pg_temp.spv1_require_column('auth', 'users', 'id');
  perform pg_temp.spv1_require_column('auth', 'users', 'email');
  perform pg_temp.spv1_require_column('auth', 'users', 'instance_id');
  perform pg_temp.spv1_require_column('auth', 'users', 'aud');
  perform pg_temp.spv1_require_column('auth', 'users', 'role');

  perform pg_temp.spv1_require_table('public', 'game_move_logs');
  perform pg_temp.spv1_require_column('public', 'game_move_logs', 'game_id');
  perform pg_temp.spv1_require_column('public', 'game_move_logs', 'player_id');
  perform pg_temp.spv1_require_column('public', 'game_move_logs', 'san');

  perform pg_temp.spv1_require_table('public', 'tournaments');
  perform pg_temp.spv1_require_column('public', 'tournaments', 'id');
  perform pg_temp.spv1_require_column('public', 'tournaments', 'name');
  perform pg_temp.spv1_require_column('public', 'tournaments', 'status');
  perform pg_temp.spv1_require_column('public', 'tournaments', 'tempo');
  perform pg_temp.spv1_require_column('public', 'tournaments', 'live_time_control');
  perform pg_temp.spv1_require_column('public', 'tournaments', 'rated');
  perform pg_temp.spv1_require_column('public', 'tournaments', 'ecosystem_scope');

  perform pg_temp.spv1_require_table('public', 'games');
  foreach v_col in array array[
    'id', 'white_player_id', 'black_player_id', 'status', 'fen', 'turn', 'result',
    'end_reason', 'source_type', 'play_context', 'mode', 'rated', 'tempo',
    'live_time_control', 'bot_settings', 'tournament_id', 'ecosystem_scope',
    'finished_at', 'last_move_at', 'created_at', 'updated_at'
  ] loop
    perform pg_temp.spv1_require_column('public', 'games', v_col);
  end loop;

  select exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'games'
      and c.conname = 'games_play_context_check'
  ) into v_has_play_context_check;

  raise notice 'SCHEMA PREFLIGHT OK (games_play_context_check present=%)', v_has_play_context_check;
  raise notice 'TRIGGER ASSUMPTION: fixture mutations run as owner role; triggers on public.games may fire and must not require authenticated JWT context';

  u_a := pg_temp.spv1_create_user('a');
  u_b := pg_temp.spv1_create_user('b');
  u_c := pg_temp.spv1_create_user('c');

  -- -------------------------------------------------------------------------
  -- AUTH / PRIVILEGES / SIGNATURE
  -- -------------------------------------------------------------------------
  perform pg_temp.spv1_as_owner();
  begin
    perform public.get_own_successful_performance();
    perform pg_temp.spv1_assert(
      'auth',
      'unauthenticated refused',
      false,
      'RPC succeeded without JWT subject'
    );
  exception
    when sqlstate 'SP001' then
      raise;
    when sqlstate 'P0001' then
      if sqlerrm ilike '%not_authenticated%' then
        perform pg_temp.spv1_assert('auth', 'unauthenticated refused', true, sqlerrm);
      else
        raise;
      end if;
    when others then
      raise;
  end;

  select pg_get_function_identity_arguments(p.oid)
  into v_identity_args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_own_successful_performance'
    and p.pronargs = 0;
  perform pg_temp.spv1_assert(
    'auth',
    'empty function identity arguments',
    coalesce(v_identity_args, '') = '',
    coalesce(v_identity_args, '<null>')
  );

  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral unnest(coalesce(p.proacl, array[]::aclitem[])) as acl
    where n.nspname = 'public'
      and p.proname = 'get_own_successful_performance'
      and pg_get_function_identity_arguments(p.oid) = ''
      and acl::text like '=%'
  ) into v_public_execute;
  perform pg_temp.spv1_assert('auth', 'PUBLIC lacks EXECUTE (proacl catalog)', not v_public_execute);

  perform pg_temp.spv1_assert(
    'auth',
    'anon lacks EXECUTE',
    not has_function_privilege('anon', 'public.get_own_successful_performance()', 'EXECUTE')
  );
  perform pg_temp.spv1_assert(
    'auth',
    'authenticated has EXECUTE',
    has_function_privilege('authenticated', 'public.get_own_successful_performance()', 'EXECUTE')
  );

  v_rpc := pg_temp.spv1_invoke_rpc(u_a);
  perform pg_temp.spv1_assert(
    'auth',
    'SECURITY DEFINER RPC succeeds for simulated authenticated caller',
    v_rpc ? 'contract_version'
  );

  -- -------------------------------------------------------------------------
  -- CLASSIFIER (direct helper; owner role)
  -- -------------------------------------------------------------------------
  perform pg_temp.spv1_as_owner();
  perform pg_temp.spv1_assert('classifier', 'live 1m -> 1+0',
    public.successful_performance_strict_control('live', '1m') = '1+0');
  perform pg_temp.spv1_assert('classifier', 'live 1+1 -> 1+1',
    public.successful_performance_strict_control('live', '1+1') = '1+1');
  perform pg_temp.spv1_assert('classifier', 'live 2m -> 2+0',
    public.successful_performance_strict_control('live', '2m') = '2+0');
  perform pg_temp.spv1_assert('classifier', 'live 2+0 -> 2+0',
    public.successful_performance_strict_control('live', '2+0') = '2+0');
  perform pg_temp.spv1_assert('classifier', 'live 2+1 -> 2+1',
    public.successful_performance_strict_control('live', '2+1') = '2+1');
  perform pg_temp.spv1_assert('classifier', 'live 3m -> 3+0',
    public.successful_performance_strict_control('live', '3m') = '3+0');
  perform pg_temp.spv1_assert('classifier', 'live 3+2 -> 3+2',
    public.successful_performance_strict_control('live', '3+2') = '3+2');
  perform pg_temp.spv1_assert('classifier', 'live 5m -> 5+0',
    public.successful_performance_strict_control('live', '5m') = '5+0');
  perform pg_temp.spv1_assert('classifier', 'live 5+5 -> 5+5',
    public.successful_performance_strict_control('live', '5+5') = '5+5');
  perform pg_temp.spv1_assert('classifier', 'live 10m -> 10+0',
    public.successful_performance_strict_control('live', '10m') = '10+0');
  perform pg_temp.spv1_assert('classifier', 'live 15m -> 15+0',
    public.successful_performance_strict_control('live', '15m') = '15+0');
  perform pg_temp.spv1_assert('classifier', 'live 30m -> 30+0',
    public.successful_performance_strict_control('live', '30m') = '30+0');
  perform pg_temp.spv1_assert('classifier', 'live 60m -> 60+0',
    public.successful_performance_strict_control('live', '60m') = '60+0');
  perform pg_temp.spv1_assert('classifier', 'daily 1d -> 1d',
    public.successful_performance_strict_control('daily', '1d') = '1d');
  perform pg_temp.spv1_assert('classifier', 'daily 2d -> 2d',
    public.successful_performance_strict_control('daily', '2d') = '2d');
  perform pg_temp.spv1_assert('classifier', 'daily 3d -> 3d',
    public.successful_performance_strict_control('daily', '3d') = '3d');
  perform pg_temp.spv1_assert('classifier', 'daily 7d -> 7d',
    public.successful_performance_strict_control('daily', '7d') = '7d');
  perform pg_temp.spv1_assert('classifier', 'correspondence 2d -> 2d',
    public.successful_performance_strict_control('correspondence', '2d') = '2d');

  perform pg_temp.spv1_assert('classifier', 'reject 20m',
    public.successful_performance_strict_control('live', '20m') is null);
  perform pg_temp.spv1_assert('classifier', 'reject 5d',
    public.successful_performance_strict_control('daily', '5d') is null);
  perform pg_temp.spv1_assert('classifier', 'reject 5m+3s',
    public.successful_performance_strict_control('live', '5m+3s') is null);
  perform pg_temp.spv1_assert('classifier', 'reject daily + 60m',
    public.successful_performance_strict_control('daily', '60m') is null);
  perform pg_temp.spv1_assert('classifier', 'reject correspondence minute control',
    public.successful_performance_strict_control('correspondence', '3m') is null);
  perform pg_temp.spv1_assert('classifier', 'reject live + 1d',
    public.successful_performance_strict_control('live', '1d') is null);
  perform pg_temp.spv1_assert('classifier', 'reject empty control',
    public.successful_performance_strict_control('live', '') is null);
  perform pg_temp.spv1_assert('classifier', 'reject null control',
    public.successful_performance_strict_control('live', null) is null);
  perform pg_temp.spv1_assert('classifier', 'reject unknown control',
    public.successful_performance_strict_control('live', '99m') is null);

  -- -------------------------------------------------------------------------
  -- BASELINE: zero-game absent cells + battlefield lifetime materialized
  -- -------------------------------------------------------------------------
  v_rpc := pg_temp.spv1_invoke_rpc(u_a);
  perform pg_temp.spv1_assert('absent', 'zero-game exact cell omitted',
    pg_temp.spv1_exact_cell(v_rpc, 'bullet', 'white', '1+0') is null);
  perform pg_temp.spv1_assert('absent', 'zero-game mode cell omitted',
    pg_temp.spv1_mode_cell(v_rpc, 'bullet', 'white') is null);
  perform pg_temp.spv1_assert('battlefield', 'lifetime materialized at zero',
    (v_rpc->'battlefield'->'lifetime'->>'scope') = 'battlefield');
  perform pg_temp.spv1_assert('battlefield', 'lifetime games = 0 at start',
    (v_rpc->'battlefield'->'lifetime'->>'games')::int = 0);
  perform pg_temp.spv1_assert('battlefield', 'lifetime percentage null at zero',
    (v_rpc->'battlefield'->'lifetime'->'percentage') = 'null'::jsonb);

  -- -------------------------------------------------------------------------
  -- COMMON ELIGIBILITY EXCLUSIONS
  -- -------------------------------------------------------------------------
  perform pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'resign', 'free', 'live', '1m', false, 'challenge', null, null, true);
  perform pg_temp.spv1_assert('eligibility', 'exclude unrated',
    pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'white', '1+0') is null);

  perform pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'resign', 'free', 'live', '1m', true, 'bot_game', null, null, true);
  perform pg_temp.spv1_assert('eligibility', 'exclude bot_game source',
    pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'white', '1+0') is null);

  perform pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'resign', 'free', 'live', '1m', true, 'challenge', '{}'::jsonb, null, true);
  perform pg_temp.spv1_assert('eligibility', 'exclude non-null bot_settings',
    pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'white', '1+0') is null);

  v_game := pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'resign', 'free', 'live', '1m', true, 'challenge', null, null, true);
  perform pg_temp.spv1_as_owner();
  begin
    update public.games set white_player_id = null where id = v_game;
    perform pg_temp.spv1_assert(
      'eligibility',
      'missing white player excluded via RPC void predicate',
      pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_b), 'bullet', 'black', '1+0') is null,
      'branch=rpc_exclusion both-seats predicate'
    );
  exception
    when not_null_violation then
      get stacked diagnostics v_col = column_name;
      perform pg_temp.spv1_assert(
        'eligibility',
        'missing white player rejected by NOT NULL on white_player_id',
        v_col = 'white_player_id',
        format('branch=constraint_rejection column=%s err=%s', v_col, sqlerrm)
      );
    when sqlstate 'SP001' then
      raise;
  end;
  perform pg_temp.spv1_as_owner();
  delete from public.games where id = v_game;

  v_game := pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'resign', 'free', 'live', '1m', true, 'challenge', null, null, true);
  perform pg_temp.spv1_as_owner();
  update public.games set black_player_id = null where id = v_game;
  perform pg_temp.spv1_assert('eligibility', 'exclude missing black player',
    pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'white', '1+0') is null);
  perform pg_temp.spv1_as_owner();
  delete from public.games where id = v_game;

  perform pg_temp.spv1_insert_game(u_a, u_a, 'white_win', 'resign', 'free', 'live', '1m', true, 'challenge', null, null, true);
  perform pg_temp.spv1_assert('eligibility', 'exclude self-play',
    pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'white', '1+0') is null);

  perform pg_temp.spv1_insert_game(u_b, u_c, 'white_win', 'resign', 'free', 'live', '1m', true, 'challenge', null, null, true);
  perform pg_temp.spv1_assert('eligibility', 'exclude nonparticipant caller',
    pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'white', '1+0') is null);

  perform pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'superseded', 'free', 'live', '1m', true, 'challenge', null, null, true);
  perform pg_temp.spv1_assert('eligibility', 'exclude superseded',
    pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'white', '1+0') is null);

  perform pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'expired_open_seat', 'free', 'live', '1m', true, 'challenge', null, null, true);
  perform pg_temp.spv1_assert('eligibility', 'exclude expired_open_seat',
    pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'white', '1+0') is null);

  perform pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'abandoned_before_move', 'free', 'live', '1m', true, 'challenge', null, null, true);
  perform pg_temp.spv1_assert('eligibility', 'exclude abandoned_before_move',
    pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'white', '1+0') is null);

  perform pg_temp.spv1_as_owner();
  begin
    perform pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'no_first_move', 'free', 'live', '1m', true, 'challenge', null, null, true);
    perform pg_temp.spv1_assert(
      'eligibility',
      'no_first_move excluded via RPC void predicate',
      pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'white', '1+0') is null,
      'branch=rpc_exclusion storage reachable'
    );
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      perform pg_temp.spv1_assert(
        'eligibility',
        'no_first_move rejected by games_end_reason_check',
        v_constraint = 'games_end_reason_check',
        format('branch=schema_rejection constraint=%s err=%s', v_constraint, sqlerrm)
      );
    when sqlstate 'SP001' then
      raise;
  end;

  v_game := pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'resign', 'free', 'live', '1m', true, 'challenge', null, null, false);
  perform pg_temp.spv1_assert('eligibility', 'exclude missing move log',
    pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'white', '1+0') is null);
  perform pg_temp.spv1_as_owner();
  delete from public.games where id = v_game;

  perform pg_temp.spv1_as_owner();
  begin
    v_game := pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'resign', 'free', 'live', '1m', true, 'challenge', null, null, true);
    update public.games set result = 'not_a_valid_result' where id = v_game;
    perform pg_temp.spv1_assert('eligibility', 'exclude unsupported result via RPC',
      pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'white', '1+0') is null);
    perform pg_temp.spv1_as_owner();
    delete from public.games where id = v_game;
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      perform pg_temp.spv1_assert(
        'eligibility',
        'unsupported result rejected by schema constraint',
        v_constraint = 'games_result_check',
        format('constraint=%s err=%s', v_constraint, sqlerrm)
      );
    when sqlstate 'SP001' then
      raise;
  end;

  perform pg_temp.spv1_as_owner();
  begin
    perform pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'resign', 'invalid_context', 'live', '1m', true, 'challenge', null, null, true);
    if v_has_play_context_check then
      perform pg_temp.spv1_assert('eligibility', 'invalid play_context insert rejected', false, 'insert succeeded despite games_play_context_check catalog presence');
    else
      perform pg_temp.spv1_assert('eligibility', 'invalid play_context excluded from free-play lane',
        pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'white', '1+0') is null);
      perform pg_temp.spv1_assert('eligibility', 'invalid play_context excluded from tournament lane',
        (pg_temp.spv1_invoke_rpc(u_a)->'battlefield'->'lifetime'->>'games')::int = 0);
    end if;
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      perform pg_temp.spv1_assert(
        'eligibility',
        'invalid play_context rejected by games_play_context_check',
        v_constraint = 'games_play_context_check',
        format('constraint=%s err=%s', v_constraint, sqlerrm)
      );
    when sqlstate 'SP001' then
      raise;
  end;

  -- -------------------------------------------------------------------------
  -- SCORING + COLOR (eligible rows)
  -- -------------------------------------------------------------------------
  perform pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'resign', 'free', 'live', '1m', true, 'challenge', null, null, true);
  perform pg_temp.spv1_insert_game(u_a, u_b, 'draw', 'draw_agreement', 'free', 'live', '1m', true, 'challenge', null, null, true);
  perform pg_temp.spv1_insert_game(u_b, u_a, 'white_win', 'resign', 'free', 'live', '1m', true, 'challenge', null, null, true);

  v_rpc := pg_temp.spv1_invoke_rpc(u_a);
  v_cell := pg_temp.spv1_exact_cell(v_rpc, 'bullet', 'white', '1+0');
  perform pg_temp.spv1_assert('scoring', 'white win=1 draw=0.5',
    (v_cell->>'wins')::int = 1 and (v_cell->>'draws')::int = 1 and (v_cell->>'losses')::int = 0);
  perform pg_temp.spv1_assert('scoring', 'white score numeric',
    (v_cell->>'score')::numeric = 1.5);
  perform pg_temp.spv1_assert('scoring', 'white percentage not integer-truncated',
    (v_cell->>'percentage')::numeric = 75.0);

  v_cell := pg_temp.spv1_exact_cell(v_rpc, 'bullet', 'black', '1+0');
  perform pg_temp.spv1_assert('scoring', 'black loss=0 on opponent white_win',
    (v_cell->>'wins')::int = 0 and (v_cell->>'draws')::int = 0 and (v_cell->>'losses')::int = 1);
  perform pg_temp.spv1_assert('scoring', 'black separate from white',
    (v_cell->>'games')::int = 1 and pg_temp.spv1_exact_cell(v_rpc, 'bullet', 'white', '1+0') is distinct from v_cell);

  -- -------------------------------------------------------------------------
  -- UNLOCK BOUNDARIES
  -- -------------------------------------------------------------------------
  for v_i in 1..9 loop
    perform pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'resign', 'free', 'live', '2m', true, 'challenge', null, null, true);
  end loop;
  v_cell := pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'white', '2+0');
  perform pg_temp.spv1_assert('unlock', 'exact locked at 9', coalesce((v_cell->>'unlocked')::boolean, false) = false);

  perform pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'resign', 'free', 'live', '2m', true, 'challenge', null, null, true);
  v_cell := pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'white', '2+0');
  perform pg_temp.spv1_assert('unlock', 'exact unlocked at 10', (v_cell->>'unlocked')::boolean = true);

  perform pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'resign', 'free', 'live', '2m', true, 'challenge', null, null, true);
  v_cell := pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'white', '2+0');
  perform pg_temp.spv1_assert('unlock', 'exact remains unlocked at 11', (v_cell->>'unlocked')::boolean = true and (v_cell->>'games')::int = 11);

  for v_i in 1..99 loop
    perform pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'resign', 'free', 'live', '3m', true, 'challenge', null, null, true);
  end loop;
  v_cell := pg_temp.spv1_mode_cell(pg_temp.spv1_invoke_rpc(u_a), 'blitz', 'white');
  perform pg_temp.spv1_assert('unlock', 'broad locked at 99 without path B', coalesce((v_cell->>'unlocked')::boolean, false) = false);

  perform pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'resign', 'free', 'live', '3m', true, 'challenge', null, null, true);
  v_cell := pg_temp.spv1_mode_cell(pg_temp.spv1_invoke_rpc(u_a), 'blitz', 'white');
  perform pg_temp.spv1_assert('unlock', 'broad unlocked at 100', (v_cell->>'unlocked')::boolean = true);

  -- Path B: four exact controls x 10 each for bullet black.
  -- Includes one prior eligible bullet-black game from scoring fixtures (u_a as black loss on 1+0).
  for v_i in 1..10 loop
    perform pg_temp.spv1_insert_game(u_b, u_a, 'black_win', 'resign', 'free', 'live', '1m', true, 'challenge', null, null, true);
    perform pg_temp.spv1_insert_game(u_b, u_a, 'black_win', 'resign', 'free', 'live', '1+1', true, 'challenge', null, null, true);
    perform pg_temp.spv1_insert_game(u_b, u_a, 'black_win', 'resign', 'free', 'live', '2m', true, 'challenge', null, null, true);
    perform pg_temp.spv1_insert_game(u_b, u_a, 'black_win', 'resign', 'free', 'live', '2+1', true, 'challenge', null, null, true);
  end loop;
  v_cell := pg_temp.spv1_mode_cell(pg_temp.spv1_invoke_rpc(u_a), 'bullet', 'black');
  perform pg_temp.spv1_assert(
    'unlock',
    'broad path B unlocked below 100 total (41 includes prior scoring fixture)',
    (v_cell->>'unlocked')::boolean = true and (v_cell->>'games')::int = 41
  );

  -- -------------------------------------------------------------------------
  -- BATTLEFIELD / TOURNAMENT
  -- -------------------------------------------------------------------------
  perform pg_temp.spv1_as_owner();
  insert into public.tournaments (id, name, status, tempo, live_time_control, rated, ecosystem_scope)
  values (gen_random_uuid(), 'SPV1 Tournament A', 'active', 'live', null, true, 'adult')
  returning id into t_a;

  insert into public.tournaments (id, name, status, tempo, live_time_control, rated, ecosystem_scope)
  values (gen_random_uuid(), 'SPV1 Tournament B', 'active', 'live', null, true, 'adult')
  returning id into t_b;

  perform pg_temp.spv1_insert_game(u_a, u_b, 'white_win', 'resign', 'tournament', 'live', null, true, 'tournament_bracket', null, t_a, true);
  perform pg_temp.spv1_insert_game(u_b, u_c, 'white_win', 'resign', 'tournament', 'live', null, true, 'tournament_bracket', null, t_b, true);

  v_rpc := pg_temp.spv1_invoke_rpc(u_a);
  perform pg_temp.spv1_assert('battlefield', 'lifetime counts eligible tournament games',
    (v_rpc->'battlefield'->'lifetime'->>'games')::int = 1);
  perform pg_temp.spv1_assert(
    'battlefield',
    'null live_time_control tournament aggregate present',
    exists (
      select 1
      from jsonb_array_elements(coalesce(v_rpc->'battlefield'->'tournaments', '[]'::jsonb)) elem
      where (elem->>'tournament_id')::uuid = t_a
        and (elem->>'games')::int = 1
    )
  );
  perform pg_temp.spv1_assert(
    'battlefield',
    'caller A sees only tournaments with eligible games',
    jsonb_array_length(coalesce(v_rpc->'battlefield'->'tournaments', '[]'::jsonb)) = 1
      and (v_rpc->'battlefield'->'tournaments'->0->>'tournament_id')::uuid = t_a
  );

  v_rpc := pg_temp.spv1_invoke_rpc(u_c);
  perform pg_temp.spv1_assert(
    'battlefield',
    'caller C sees exactly one tournament (t_b)',
    jsonb_array_length(coalesce(v_rpc->'battlefield'->'tournaments', '[]'::jsonb)) = 1
      and (v_rpc->'battlefield'->'tournaments'->0->>'tournament_id')::uuid = t_b
  );
  perform pg_temp.spv1_assert(
    'battlefield',
    'caller C does not see caller A tournament t_a',
    not exists (
      select 1
      from jsonb_array_elements(coalesce(v_rpc->'battlefield'->'tournaments', '[]'::jsonb)) elem
      where (elem->>'tournament_id')::uuid = t_a
    )
  );

  -- -------------------------------------------------------------------------
  -- RESPONSE CONTRACT + PRIVACY + DETERMINISM + CROSS-PLAYER ISOLATION
  -- Fixture inventory for Bullet / White / 1+0 at isolation check:
  --   A: scoring win + scoring draw = 2
  --   B: nonparticipant fixture win (B vs C) + scoring win (B vs A) + 10 Path-B 1m wins = 12
  -- -------------------------------------------------------------------------
  v_rpc := pg_temp.spv1_invoke_rpc(u_a);
  perform pg_temp.spv1_assert('response', 'contract_version present', v_rpc ? 'contract_version');
  perform pg_temp.spv1_assert('response', 'free_play present', v_rpc ? 'free_play');
  perform pg_temp.spv1_assert('response', 'battlefield present', v_rpc ? 'battlefield');

  v_text := v_rpc::text;
  perform pg_temp.spv1_assert('privacy', 'no game_id key', position('"game_id"' in v_text) = 0);
  perform pg_temp.spv1_assert('privacy', 'no opponent_id key', position('"opponent_id"' in v_text) = 0);
  perform pg_temp.spv1_assert('privacy', 'no white_player_id key', position('"white_player_id"' in v_text) = 0);
  perform pg_temp.spv1_assert('privacy', 'no black_player_id key', position('"black_player_id"' in v_text) = 0);
  perform pg_temp.spv1_assert('privacy', 'no finished_at key', position('"finished_at"' in v_text) = 0);

  v_first := pg_temp.spv1_invoke_rpc(u_a);
  v_second := pg_temp.spv1_invoke_rpc(u_a);
  perform pg_temp.spv1_assert('numeric', 'deterministic repeated execution', v_first = v_second);

  v_a_games := (pg_temp.spv1_exact_cell(v_first, 'bullet', 'white', '1+0')->>'games')::int;
  v_b_games := (pg_temp.spv1_exact_cell(pg_temp.spv1_invoke_rpc(u_b), 'bullet', 'white', '1+0')->>'games')::int;
  perform pg_temp.spv1_assert('privacy', 'caller A sees exactly 2 bullet white 1+0 games', v_a_games = 2);
  perform pg_temp.spv1_assert('privacy', 'caller B sees exactly 12 bullet white 1+0 games', v_b_games = 12);
end;
$main$;

select section, name, passed, detail
from spv1_assertions
order by section, name;

select
  count(*) filter (where passed) as passed,
  count(*) filter (where not passed) as failed,
  count(*) as total
from spv1_assertions;

rollback;
