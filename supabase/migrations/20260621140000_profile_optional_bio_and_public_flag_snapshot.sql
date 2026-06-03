-- Optional bio (empty or 1–250 words) and public snapshot flag exposure.
-- Replaces hardened RPC bio contract and reasserts canonical get_public_profile_snapshot.

begin;

-- ---------------------------------------------------------------------------
-- 5A) Optional bio on hardened profile identity RPC (void return unchanged)
-- ---------------------------------------------------------------------------

create or replace function public.update_own_profile_identity(
  p_bio text,
  p_avatar_path text,
  p_flag text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid;
  v_bio text;
  v_avatar_path text;
  v_flag text;
  v_word_count integer;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'authentication required';
  end if;

  v_bio := nullif(btrim(coalesce(p_bio, '')), '');

  if v_bio is not null then
    if char_length(v_bio) > 12000 then
      raise exception 'bio exceeds maximum length';
    end if;

    v_word_count := cardinality(regexp_split_to_array(v_bio, '\s+'));

    if v_word_count > 250 then
      raise exception 'Bio must be 250 words or fewer';
    end if;
  end if;

  v_avatar_path := nullif(btrim(coalesce(p_avatar_path, '')), '');

  if v_avatar_path is not null
     and v_avatar_path not like (v_uid::text || '/%') then
    raise exception 'avatar_path must be namespaced under caller uid';
  end if;

  v_flag := upper(nullif(btrim(coalesce(p_flag, '')), ''));

  if v_flag is not null
     and v_flag <> 'OTHER'
     and v_flag !~ '^[A-Z]{2}$' then
    raise exception 'flag must be a two-letter country code, OTHER, or empty';
  end if;

  update public.profiles
  set
    bio = v_bio,
    avatar_path = v_avatar_path,
    flag = v_flag
  where id = v_uid;

  if not found then
    raise exception 'profile row not found for authenticated user';
  end if;
end;
$$;

comment on function public.update_own_profile_identity(text, text, text) is
  'Hardened self-profile identity update (bio/avatar/flag). Bio optional; non-empty bio max 250 words. Returns void.';

revoke all on function public.update_own_profile_identity(text, text, text) from public;
revoke all on function public.update_own_profile_identity(text, text, text) from anon;
revoke all on function public.update_own_profile_identity(text, text, text) from service_role;
grant execute on function public.update_own_profile_identity(text, text, text) to authenticated;

create or replace function public.update_own_profile_identity(
  p_bio text default null,
  p_avatar_path text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid;
  v_existing_flag text;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select p.flag
  into v_existing_flag
  from public.profiles p
  where p.id = v_uid;

  if not found then
    raise exception 'profile row not found for authenticated user';
  end if;

  perform public.update_own_profile_identity(p_bio, p_avatar_path, v_existing_flag);
end;
$$;

comment on function public.update_own_profile_identity(text, text) is
  'Compatibility wrapper: updates bio/avatar while preserving existing flag. Delegates to hardened 3-arg RPC.';

revoke all on function public.update_own_profile_identity(text, text) from public;
revoke all on function public.update_own_profile_identity(text, text) from anon;
revoke all on function public.update_own_profile_identity(text, text) from service_role;
grant execute on function public.update_own_profile_identity(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5B) Public snapshot: expose profile country/flag (canonical P1+identity body)
-- ---------------------------------------------------------------------------

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
  'Privacy-safe public profile payload. Intentionally exposes profile.flag for public country/flag pill. Includes legacy ratings[] plus p1.';

commit;
