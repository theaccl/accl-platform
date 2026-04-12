-- Public profile snapshot RPC (privacy-safe read model).
-- Exposes curated player identity + accomplishments for public profile routing.

create or replace function public.get_public_profile_snapshot(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
  out jsonb;
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

  out := jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id,
      'username', nullif(trim(coalesce(p.username, '')), ''),
      'created_at', p.created_at,
      'bio', nullif(trim(coalesce(p.bio, '')), ''),
      'avatar_path', nullif(trim(coalesce(p.avatar_path, '')), '')
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
  'Privacy-safe public profile payload. Excludes private account fields (email/internal metadata).';

revoke all on function public.get_public_profile_snapshot(uuid) from public;
grant execute on function public.get_public_profile_snapshot(uuid) to anon, authenticated;
