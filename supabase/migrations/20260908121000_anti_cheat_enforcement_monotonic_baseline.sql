-- Prevent concurrent analysis requests from replacing a stronger durable
-- enforcement baseline with a weaker recommendation. Moderator override
-- columns remain independently managed by the existing moderator workflow.

create or replace function public.preserve_stronger_anti_cheat_enforcement_baseline()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old_rank integer;
  v_new_rank integer;
begin
  v_old_rank := case old.enforcement_state
    when 'NO_RESTRICTION' then 0
    when 'MONITOR_ONLY' then 1
    when 'LIMITED_ANALYSIS' then 2
    when 'TRAINER_LOCKED' then 3
    when 'REVIEW_LOCKED' then 4
    else null
  end;
  v_new_rank := case new.enforcement_state
    when 'NO_RESTRICTION' then 0
    when 'MONITOR_ONLY' then 1
    when 'LIMITED_ANALYSIS' then 2
    when 'TRAINER_LOCKED' then 3
    when 'REVIEW_LOCKED' then 4
    else null
  end;

  if v_old_rank is null or v_new_rank is null then
    raise exception 'invalid anti-cheat enforcement baseline';
  end if;

  if v_new_rank < v_old_rank then
    new.enforcement_state := old.enforcement_state;
    new.source_suspicion_tier := old.source_suspicion_tier;
    new.source_recommended_action := old.source_recommended_action;
    new.source_reason_json := old.source_reason_json;
  end if;

  return new;
end;
$$;

revoke all on function public.preserve_stronger_anti_cheat_enforcement_baseline() from public;
revoke all on function public.preserve_stronger_anti_cheat_enforcement_baseline() from anon;
revoke all on function public.preserve_stronger_anti_cheat_enforcement_baseline() from authenticated;

drop trigger if exists preserve_stronger_anti_cheat_enforcement_baseline
  on public.anti_cheat_enforcement_states;
create trigger preserve_stronger_anti_cheat_enforcement_baseline
before update on public.anti_cheat_enforcement_states
for each row
execute function public.preserve_stronger_anti_cheat_enforcement_baseline();
