-- Trophy milestone emitter (narrow first caller):
-- Tournament champion only.

create or replace function public.emit_trophy_for_tournament_champion(
  p_tournament_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments%rowtype;
  m public.tournament_matches%rowtype;
  v_champion uuid;
  v_key text;
  v_pace text;
  v_outcome jsonb;
begin
  if p_tournament_id is null then
    raise exception 'tournament_id is required';
  end if;

  select *
    into t
  from public.tournaments
  where id = p_tournament_id;

  if not found then
    raise exception 'tournament not found';
  end if;

  if t.status is distinct from 'completed' then
    insert into public.trophy_issuance_audit (
      emitter, source_tournament_id, outcome, details
    )
    values (
      'emit_trophy_for_tournament_champion',
      p_tournament_id,
      'skipped',
      jsonb_build_object('reason', 'tournament_not_completed')
    );
    return jsonb_build_object('issued', false, 'reason', 'tournament_not_completed');
  end if;

  -- Champion is the winner of the final match (root node: next_match_id is null).
  select *
    into m
  from public.tournament_matches
  where tournament_id = p_tournament_id
    and next_match_id is null
  order by round_number desc, match_number desc
  limit 1;

  if not found then
    insert into public.trophy_issuance_audit (
      emitter, source_tournament_id, outcome, details
    )
    values (
      'emit_trophy_for_tournament_champion',
      p_tournament_id,
      'skipped',
      jsonb_build_object('reason', 'final_match_missing')
    );
    return jsonb_build_object('issued', false, 'reason', 'final_match_missing');
  end if;

  v_champion := m.winner_id;
  if v_champion is null then
    insert into public.trophy_issuance_audit (
      emitter, source_tournament_id, outcome, details
    )
    values (
      'emit_trophy_for_tournament_champion',
      p_tournament_id,
      'skipped',
      jsonb_build_object('reason', 'champion_missing')
    );
    return jsonb_build_object('issued', false, 'reason', 'champion_missing');
  end if;

  v_key := format('tournament_complete:%s:champion', p_tournament_id::text);

  v_pace :=
    case
      when lower(trim(coalesce(t.tempo, ''))) in ('live', 'daily', 'correspondence')
        then lower(trim(t.tempo))
      else null
    end;

  v_outcome := public.orchestrate_trophy_issuance(
    p_user_id => v_champion,
    p_milestone_key => v_key,
    p_title => 'Tournament Champion',
    p_category => 'tournament',
    p_date_awarded => now(),
    p_source_game_id => m.game_id,
    p_source_tournament_id => p_tournament_id,
    p_placement => 1,
    p_level => 'champion',
    p_description => 'Awarded for winning a completed tournament.'
  );

  return v_outcome;
exception
  when others then
    insert into public.trophy_issuance_audit (
      emitter, source_tournament_id, milestone_key, outcome, details
    )
    values (
      'emit_trophy_for_tournament_champion',
      p_tournament_id,
      format('tournament_complete:%s:champion', p_tournament_id::text),
      'error',
      jsonb_build_object('error', sqlerrm)
    );
    raise;
end;
$$;

comment on function public.emit_trophy_for_tournament_champion(uuid) is
  'Trusted tournament champion trophy emitter. Uses final match winner on completed tournament; key=tournament_complete:<tournament_id>:champion.';

revoke all on function public.emit_trophy_for_tournament_champion(uuid) from public;
grant execute on function public.emit_trophy_for_tournament_champion(uuid) to service_role;
