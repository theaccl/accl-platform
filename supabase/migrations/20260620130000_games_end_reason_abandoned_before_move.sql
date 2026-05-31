-- Extend games.end_reason CHECK: preserve live allow-list + canonical lifecycle / finish writers.
--
-- Live (SQL Editor): abandoned, checkmate, draw, draw_agreement, insufficient_material,
-- resign, stalemate, superseded, threefold_repetition, timeout.
-- Additive: abandoned_before_move (neutral pre-start cancel), fifty_move_rule (terminal/bot),
-- expired_open_seat (expire_open_seats RPC).

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.games'::regclass
      and conname = 'games_end_reason_check'
  ) then
    alter table public.games
      drop constraint games_end_reason_check;
  end if;
end $$;

alter table public.games
  add constraint games_end_reason_check check (
    end_reason is null
    or btrim(end_reason::text) = ''
    or lower(btrim(end_reason::text)) in (
      'abandoned',
      'checkmate',
      'draw',
      'draw_agreement',
      'insufficient_material',
      'resign',
      'stalemate',
      'superseded',
      'threefold_repetition',
      'timeout',
      'abandoned_before_move',
      'fifty_move_rule',
      'expired_open_seat'
    )
  );

comment on constraint games_end_reason_check on public.games is
  'Allowed games.end_reason tokens; live values plus canonical lifecycle and fifty-move writers.';
