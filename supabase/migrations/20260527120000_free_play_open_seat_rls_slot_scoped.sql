-- RLS: allow multiple free open seats in different PLAT slots (Rapid+Blitz+Daily).
-- The previous one-row-global rule in auth_free_play_blocks_new_open_seat(uuid) blocked
-- a second post while the user had any other open seat.

create or replace function public.free_play_queue_slot_key(
  p_tempo text,
  p_ltc text,
  p_rated boolean
) returns text
language plpgsql
immutable
set search_path = public
as $f$
declare
  t text := lower(btrim(coalesce(p_tempo, '')));
  c text := lower(regexp_replace(btrim(coalesce(p_ltc, '')), E'[[:space:]]+', '', 'g'));
  m text;
  -- Mirrors lib/platOpenSeatBucket.ts
begin
  if t = 'correspondence' then
    return null;
  end if;
  if t = 'daily' then
    if c in ('1d', '2d', '3d') then
      m := 'daily';
    elsif c in ('30m', '60m') then
      m := 'rapid';
    else
      m := 'daily';
    end if;
  elsif t = 'live' then
    m := case
      when c in ('1m', '1+1', '2+1') then 'bullet'
      when c in ('3m', '3+2', '5m', '5+5', '5m+3s') then 'blitz'
      when c in ('10m', '15m', '20m', '30m', '60m') then 'rapid'
      else null
    end;
  else
    return null;
  end if;
  if m is null or c = '' then
    return null;
  end if;
  return m || ':' || c || ':' || case when coalesce(p_rated, false) then 't' else 'f' end;
end;
$f$;

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
  if lt = 'daily' then
    return false;
  end if;
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

comment on function public.free_play_queue_slot_key(text, text, boolean) is
  'PLAT slot key; aligned with lib/platOpenSeatBucket + freePlayQueueSlotConflict.';

comment on function public.auth_free_play_blocks_new_open_seat(uuid, text, text, boolean) is
  'Block new free open seat only when the user is already in the same slot (or duplicate open seat in same slot).';

revoke all on function public.auth_free_play_blocks_new_open_seat(uuid, text, text, boolean) from public;
grant execute on function public.auth_free_play_blocks_new_open_seat(uuid, text, text, boolean) to authenticated, service_role;

revoke all on function public.free_play_queue_slot_key(text, text, boolean) from public;
grant execute on function public.free_play_queue_slot_key(text, text, boolean) to authenticated, service_role;

-- Policy must be dropped before dropping the legacy 1-arg overload (policy WITH CHECK references it).
drop policy if exists "games_authenticated_insert_free_open_seat" on public.games;
drop function if exists public.auth_free_play_blocks_new_open_seat(uuid);

create policy "games_authenticated_insert_free_open_seat"
  on public.games
  for insert
  to authenticated
  with check (
    play_context = 'free'
    and tournament_id is null
    and white_player_id = (select auth.uid())
    and black_player_id is null
    and coalesce(status, '') in ('active', 'waiting')
    and not public.auth_free_play_blocks_new_open_seat(
      (select auth.uid()),
      coalesce(tempo, ''),
      coalesce(live_time_control, ''),
      coalesce(rated, false)
    )
  );

comment on policy "games_authenticated_insert_free_open_seat" on public.games is
  'Free-play open seat insert: slot-scoped, not one global; uses auth_free_play_blocks_new_open_seat(4 arg).';
