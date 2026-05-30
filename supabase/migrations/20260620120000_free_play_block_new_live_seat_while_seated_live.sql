-- P0 cross-slot live-seat authority (DB-enforced).
--
-- Defect: auth_free_play_blocks_new_open_seat(...) was purely slot-scoped, so a user
-- already SEATED in an active two-player live game could still insert a new live open
-- seat in a different slot (e.g. seated Rapid 10m -> create Rapid 15m). A TypeScript-only
-- gate is bypassable via direct PostgREST insert, so the rule must live in RLS too.
--
-- Fix (additive): before the slot-key comparison, when the requested new seat is LIVE
-- and the user is seated in ANY active two-player live free-play game, block creation
-- across every mode / exact time control / rated flag.
--
-- Preserved unchanged: daily early return, free_play_queue_slot_key, the slot-scoped
-- waiting-seat rule for the not-seated case, the insert policy, and all RLS outside
-- this seated-live invariant. No schema columns, no backfill, no cleanup sweep.

create or replace function public.auth_free_play_blocks_new_open_seat(
  p_uid uuid,
  p_new_tempo text,
  p_new_ltc text,
  p_new_rated boolean
) returns boolean
language plpgsql
stable
set search_path = public
security definer
as $b$
declare
  k text;
  lt text := lower(btrim(coalesce(p_new_tempo, '')));
begin
  -- Daily creation is never blocked by live containment (multiple daily allowed).
  if lt = 'daily' then
    return false;
  end if;

  -- P0 global seated-live block (NOT slot-scoped): if the user already occupies a
  -- seated two-player active/waiting live game, block any new LIVE open seat.
  if lt = 'live' then
    if exists (
      select 1
      from public.games g
      where g.play_context = 'free'
        and g.tournament_id is null
        and g.status in ('active', 'waiting')
        and lower(btrim(coalesce(g.tempo, ''))) = 'live'
        and g.white_player_id is not null
        and g.black_player_id is not null
        and (g.white_player_id = p_uid or g.black_player_id = p_uid)
    ) then
      return true;
    end if;
  end if;

  -- Existing slot-scoped rule (unchanged): block only a same-slot duplicate when the
  -- user is not seated in a live game (preserves multi-slot waiting-seat doctrine).
  k := public.free_play_queue_slot_key(
    p_new_tempo,
    p_new_ltc,
    p_new_rated
  );
  if k is null or k = '' then
    return false;
  end if;
  return exists (
    select 1
    from public.games g
    where g.play_context = 'free'
      and g.tournament_id is null
      and g.status in ('active', 'waiting')
      and (g.white_player_id = p_uid or g.black_player_id = p_uid)
      and public.free_play_queue_slot_key(
        g.tempo,
        coalesce(g.live_time_control, ''),
        coalesce(g.rated, false)
      ) = k
  );
end;
$b$;

comment on function public.auth_free_play_blocks_new_open_seat(uuid, text, text, boolean) is
  'Block new free open seat: (1) global block when seated in any active live game and requesting a new live seat; (2) otherwise the existing slot-scoped same-slot duplicate rule. Daily excluded.';

revoke all on function public.auth_free_play_blocks_new_open_seat(uuid, text, text, boolean) from public;
grant execute on function public.auth_free_play_blocks_new_open_seat(uuid, text, text, boolean) to authenticated, service_role;
