-- Distinguish missing games vs ecosystem mismatch vs "exists but not publicly spectatable" for /game/[id] UX.

create or replace function public.game_public_route_hint(
  p_game_id uuid,
  p_viewer_ecosystem text default 'adult'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  eco text;
begin
  if p_game_id is null then
    return 'missing';
  end if;

  select ecosystem_scope::text
    into eco
    from public.games
   where id = p_game_id;

  if not found then
    return 'missing';
  end if;

  if eco is distinct from coalesce(nullif(trim(p_viewer_ecosystem), ''), 'adult') then
    return 'ecosystem_mismatch';
  end if;

  return 'sign_in_required';
end;
$$;

comment on function public.game_public_route_hint(uuid, text) is
  'Anonymous /game/[id] hint when get_public_spectate_game_snapshot returns null — not for authorization decisions.';

revoke all on function public.game_public_route_hint(uuid, text) from public;
grant execute on function public.game_public_route_hint(uuid, text) to anon, authenticated;
