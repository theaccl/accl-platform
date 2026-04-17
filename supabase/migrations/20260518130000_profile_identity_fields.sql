-- Profile identity: flag, activity, streak/cache stats; extend identity RPC + snapshot.

alter table public.profiles
  add column if not exists flag text,
  add column if not exists last_active_at timestamptz,
  add column if not exists username_change_count int not null default 0,
  add column if not exists games_played int not null default 0,
  add column if not exists current_streak int not null default 0,
  add column if not exists highest_streak int not null default 0;

comment on column public.profiles.flag is 'Optional public flag label (ISO code or free text; UI-owned).';
comment on column public.profiles.last_active_at is 'Last observed client activity heartbeat for online presence.';
comment on column public.profiles.username_change_count is 'Reserved for future username change limits.';
comment on column public.profiles.games_played is 'Optional cached games count; prefer finished_games_count in snapshot when reconciling.';
comment on column public.profiles.current_streak is 'Optional streak display field.';
comment on column public.profiles.highest_streak is 'Optional best streak display field.';

create or replace function public.touch_profile_activity()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update public.profiles
  set last_active_at = now()
  where id = auth.uid();
end;
$$;

comment on function public.touch_profile_activity() is
  'Sets profiles.last_active_at to now() for the authenticated user.';

revoke all on function public.touch_profile_activity() from public;
grant execute on function public.touch_profile_activity() to authenticated;

-- Bio length raised to support 150–250 word bios (validated in app).
create or replace function public.update_own_profile_identity(
  p_bio text default null,
  p_avatar_path text default null,
  p_flag text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_bio text;
  v_avatar_path text;
  v_flag text;
  v_row public.profiles%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  v_bio := nullif(trim(coalesce(p_bio, '')), '');
  if v_bio is not null and char_length(v_bio) > 12000 then
    raise exception 'bio exceeds maximum length';
  end if;

  v_avatar_path := nullif(trim(coalesce(p_avatar_path, '')), '');
  if v_avatar_path is not null then
    if left(v_avatar_path, 37) <> (v_uid::text || '/') then
      raise exception 'avatar_path must be namespaced under caller uid';
    end if;
  end if;

  v_flag := nullif(trim(coalesce(p_flag, '')), '');
  if v_flag is not null and char_length(v_flag) > 64 then
    raise exception 'flag exceeds maximum length';
  end if;

  update public.profiles
  set
    bio = v_bio,
    avatar_path = v_avatar_path,
    flag = v_flag
  where id = v_uid
  returning * into v_row;

  if not found then
    raise exception 'profile row not found for authenticated user';
  end if;

  return v_row;
end;
$$;

comment on function public.update_own_profile_identity(text, text, text) is
  'Trusted self-profile identity update RPC (bio/avatar/flag). Caller can only update own profile row.';

revoke all on function public.update_own_profile_identity(text, text, text) from public;
grant execute on function public.update_own_profile_identity(text, text, text) to authenticated;

-- Back-compat: 2-arg callers update bio/avatar only (does not change flag).
create or replace function public.update_own_profile_identity(
  p_bio text default null,
  p_avatar_path text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_bio text;
  v_avatar_path text;
  v_row public.profiles%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  v_bio := nullif(trim(coalesce(p_bio, '')), '');
  if v_bio is not null and char_length(v_bio) > 12000 then
    raise exception 'bio exceeds maximum length';
  end if;

  v_avatar_path := nullif(trim(coalesce(p_avatar_path, '')), '');
  if v_avatar_path is not null then
    if left(v_avatar_path, 37) <> (v_uid::text || '/') then
      raise exception 'avatar_path must be namespaced under caller uid';
    end if;
  end if;

  update public.profiles
  set
    bio = v_bio,
    avatar_path = v_avatar_path
  where id = v_uid
  returning * into v_row;

  if not found then
    raise exception 'profile row not found for authenticated user';
  end if;

  return v_row;
end;
$$;

revoke all on function public.update_own_profile_identity(text, text) from public;
grant execute on function public.update_own_profile_identity(text, text) to authenticated;

create or replace function public.get_public_profile_snapshot(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
  out jsonb;
  v_tu int;
begin
  if p_profile_id is null then
    return null;
  end if;

  select *
    into p
  from public.profiles
  where id = p_profile_id;

  if not found then
    return null;
  end if;

  v_tu := (
    select pr.rating
    from public.player_ratings pr
    where pr.user_id = p_profile_id and pr.bucket = 'tournament_unified'
    limit 1
  );

  out := jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id,
      'username', nullif(trim(coalesce(p.username, '')), ''),
      'created_at', p.created_at,
      'bio', nullif(trim(coalesce(p.bio, '')), ''),
      'avatar_path', nullif(trim(coalesce(p.avatar_path, '')), ''),
      'flag', nullif(trim(coalesce(p.flag, '')), ''),
      'last_active_at', p.last_active_at,
      'games_played', coalesce(p.games_played, 0),
      'current_streak', coalesce(p.current_streak, 0),
      'highest_streak', coalesce(p.highest_streak, 0)
    ),
    'ratings', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'bucket', pr.bucket,
            'rating', pr.rating,
            'games_played', pr.games_played
          )
          order by pr.bucket
        )
        from public.player_ratings pr
        where pr.user_id = p_profile_id
      ),
      '[]'::jsonb
    ),
    'p1', jsonb_build_object(
      'accl_rating', v_tu,
      'tournament_rating', v_tu,
      'tournament_unified', (
        select jsonb_build_object(
          'rating', pr.rating,
          'games_played', pr.games_played
        )
        from public.player_ratings pr
        where pr.user_id = p_profile_id and pr.bucket = 'tournament_unified'
      ),
      'free_bullet', (
        select jsonb_build_object('rating', pr.rating, 'games_played', pr.games_played)
        from public.player_ratings pr
        where pr.user_id = p_profile_id and pr.bucket = 'free_bullet'
      ),
      'free_blitz', (
        select jsonb_build_object('rating', pr.rating, 'games_played', pr.games_played)
        from public.player_ratings pr
        where pr.user_id = p_profile_id and pr.bucket = 'free_blitz'
      ),
      'free_rapid', (
        select jsonb_build_object('rating', pr.rating, 'games_played', pr.games_played)
        from public.player_ratings pr
        where pr.user_id = p_profile_id and pr.bucket = 'free_rapid'
      ),
      'free_day', (
        select jsonb_build_object('rating', pr.rating, 'games_played', pr.games_played)
        from public.player_ratings pr
        where pr.user_id = p_profile_id and pr.bucket = 'free_day'
      )
    ),
    'trophies', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', tr.id,
            'title', tr.title,
            'category', tr.category,
            'date_awarded', tr.date_awarded,
            'source_game_id', tr.source_game_id,
            'source_tournament_id', tr.source_tournament_id,
            'placement', tr.placement,
            'level', tr.level,
            'description', tr.description
          )
          order by tr.date_awarded desc nulls last, tr.created_at desc
        )
        from public.trophy_records tr
        where tr.user_id = p_profile_id
      ),
      '[]'::jsonb
    ),
    'vault_relics', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', vr.id,
            'title', vr.title,
            'category', vr.category,
            'date_won', vr.date_won,
            'source_game_id', vr.source_game_id,
            'source_tournament_id', vr.source_tournament_id,
            'pace', vr.pace,
            'description', vr.description
          )
          order by vr.date_won desc nulls last, vr.created_at desc
        )
        from public.vault_relic_records vr
        where vr.user_id = p_profile_id
      ),
      '[]'::jsonb
    ),
    'prestige_frame', (
      select to_jsonb(pf) - 'id' - 'user_id' - 'created_at' - 'source_basis'
      from public.prestige_profile_frames pf
      where pf.user_id = p_profile_id
      order by pf.updated_at desc
      limit 1
    ),
    'finished_games_count', (
      select count(*)::int
      from public.games g
      where g.status = 'finished'
        and (g.white_player_id = p_profile_id or g.black_player_id = p_profile_id)
    )
  );

  return out;
end;
$$;

comment on function public.get_public_profile_snapshot(uuid) is
  'Privacy-safe public profile payload. Includes legacy ratings[] plus p1 { accl_rating, tournament_rating, tournament_unified, free_* }.';
