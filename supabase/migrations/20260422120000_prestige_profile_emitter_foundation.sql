-- Prestige emitter (first trusted caller).
-- Narrow deterministic rule only:
--   1) if user has any trophy record -> base unlocked trophy frame
--   2) else if user has any vault relic record -> entry relic frame
--   3) else -> skipped (no unlock signal)
--
-- Uses real persisted source truth and calls orchestrate_prestige_profile_frame(...).

create or replace function public.emit_prestige_profile_frame_foundation(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_exists boolean := false;
  v_trophy_count int := 0;
  v_relic_count int := 0;
  v_tournament_trophy_count int := 0;
  v_max_rating int := null;
  v_ratings_sample jsonb := '[]'::jsonb;
  v_source_basis jsonb := '{}'::jsonb;
  v_result jsonb;
  v_tier text;
  v_frame_name text;
  v_motif text;
  v_accent text;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  select exists(select 1 from public.profiles where id = p_user_id) into v_user_exists;
  if not v_user_exists then
    raise exception 'profile not found for user_id %', p_user_id;
  end if;

  select count(*)
    into v_trophy_count
  from public.trophy_records
  where user_id = p_user_id;

  select count(*)
    into v_tournament_trophy_count
  from public.trophy_records
  where user_id = p_user_id
    and category = 'tournament';

  select count(*)
    into v_relic_count
  from public.vault_relic_records
  where user_id = p_user_id;

  select max(rating)
    into v_max_rating
  from public.player_ratings
  where user_id = p_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'bucket', r.bucket,
        'rating', r.rating,
        'games_played', r.games_played
      ) order by r.bucket
    ),
    '[]'::jsonb
  )
    into v_ratings_sample
  from public.player_ratings r
  where r.user_id = p_user_id;

  v_source_basis := jsonb_build_object(
    'rule_version', 'foundation_v1',
    'user_id', p_user_id,
    'evidence', jsonb_build_object(
      'trophy_count', v_trophy_count,
      'tournament_trophy_count', v_tournament_trophy_count,
      'relic_count', v_relic_count,
      'max_rating', v_max_rating,
      'ratings_snapshot', v_ratings_sample
    )
  );

  if v_trophy_count > 0 then
    v_tier := 'foundation_i';
    v_frame_name := 'Honors Frame';
    v_motif := 'laurel';
    v_accent := 'bronze';
  elsif v_relic_count > 0 then
    v_tier := 'entry_i';
    v_frame_name := 'Relic Frame';
    v_motif := 'sigil';
    v_accent := 'iron';
  else
    insert into public.prestige_state_audit (emitter, user_id, outcome, details)
    values (
      'emit_prestige_profile_frame_foundation',
      p_user_id,
      'unchanged',
      jsonb_build_object(
        'reason', 'no_unlock_signal',
        'source_basis', v_source_basis
      )
    );
    return jsonb_build_object(
      'updated', false,
      'reason', 'no_unlock_signal',
      'source_basis', v_source_basis
    );
  end if;

  v_result := public.orchestrate_prestige_profile_frame(
    p_user_id => p_user_id,
    p_current_tier => v_tier,
    p_frame_name => v_frame_name,
    p_motif_family => v_motif,
    p_accent_tier => v_accent,
    p_source_basis => v_source_basis
  );

  -- Preserve emitter-level observability in addition to orchestrator audit entries.
  insert into public.prestige_state_audit (emitter, user_id, outcome, details)
  values (
    'emit_prestige_profile_frame_foundation',
    p_user_id,
    case when coalesce((v_result->>'updated')::boolean, false) then 'updated' else 'unchanged' end,
    v_result || jsonb_build_object('source_basis', v_source_basis)
  );

  return v_result;
exception
  when others then
    insert into public.prestige_state_audit (emitter, user_id, outcome, details)
    values (
      'emit_prestige_profile_frame_foundation',
      p_user_id,
      'error',
      jsonb_build_object('error', sqlerrm)
    );
    raise;
end;
$$;

comment on function public.emit_prestige_profile_frame_foundation(uuid) is
  'First trusted prestige emitter. Deterministic rule: trophy->Honors Frame, else relic->Relic Frame, else skip.';

revoke all on function public.emit_prestige_profile_frame_foundation(uuid) from public;
grant execute on function public.emit_prestige_profile_frame_foundation(uuid) to service_role;
