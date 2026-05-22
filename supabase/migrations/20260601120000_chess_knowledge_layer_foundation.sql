-- ACCL chess knowledge layer foundation (authority-separated, no generic knowledge blob).
-- Reference only: MCO-15 / POLGAR-5334 labels — structured metadata, no copyrighted prose.
-- Engine truth remains: finished_game_analysis_* + move validation + tablebases (elsewhere).

-- ---------------------------------------------------------------------------
-- 1. Source registry
-- ---------------------------------------------------------------------------
create table if not exists public.chess_knowledge_sources (
  source_label text primary key,
  title text not null,
  author text,
  knowledge_layer text not null check (
    knowledge_layer in ('opening_encyclopedia', 'tactical_encyclopedia', 'both')
  ),
  placement_route text not null default 'profile/trainer',
  copyright_policy text not null default 'structured_metadata_only',
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.chess_knowledge_sources is
  'Licensed/reference registry for encyclopedia seeds. Never stores full book text or scans.';

insert into public.chess_knowledge_sources (source_label, title, author, knowledge_layer, placement_route, notes)
values
  (
    'MCO-15',
    'Modern Chess Openings, 15th Edition',
    'Nick de Firmian',
    'opening_encyclopedia',
    'profile/trainer/repertoire',
    'Private reference label only. Structured opening metadata seed — not live assistance.'
  ),
  (
    'POLGAR-5334',
    'Chess: 5334 Problems, Combinations, and Games',
    'Laszlo Polgar',
    'tactical_encyclopedia',
    'profile/trainer/tactical',
    'Taxonomy inspiration only. No book positions ingested in MVP.'
  )
on conflict (source_label) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Opening encyclopedia (classification / context — not chess truth)
-- ---------------------------------------------------------------------------
create table if not exists public.chess_opening_families (
  id text primary key,
  display_name text not null,
  eco_family text,
  move_prefix_san text,
  source_label text references public.chess_knowledge_sources (source_label),
  strategic_theme_tags text[] not null default '{}',
  risk_level text,
  reputation_note text,
  created_at timestamptz not null default now()
);

comment on table public.chess_opening_families is
  'Opening encyclopedia families — context/classification only. Never overrides engine, tablebase, or legality.';

create table if not exists public.chess_opening_lines (
  id uuid primary key default gen_random_uuid(),
  family_id text not null references public.chess_opening_families (id) on delete cascade,
  line_name text not null,
  move_prefix_san text not null,
  eco_code text,
  source_label text references public.chess_knowledge_sources (source_label),
  created_at timestamptz not null default now()
);

comment on table public.chess_opening_lines is
  'Named lines / move prefixes within a family. Reference layer for finished-game matching.';

-- ---------------------------------------------------------------------------
-- 3. Tactical pattern encyclopedia (training material — not chess truth)
-- ---------------------------------------------------------------------------
create table if not exists public.chess_tactical_categories (
  id text primary key,
  display_name text not null,
  source_label text references public.chess_knowledge_sources (source_label),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.chess_tactical_categories is
  'Trainer tactical taxonomy categories (POLGAR-5334-inspired structure). Training only.';

create table if not exists public.chess_tactical_tags (
  id text primary key,
  category_id text references public.chess_tactical_categories (id) on delete set null,
  display_name text not null,
  created_at timestamptz not null default now()
);

comment on table public.chess_tactical_tags is
  'Tactical motif tags for puzzles/drills. Must be verified before competitive use. No live-board assistance.';

-- ---------------------------------------------------------------------------
-- 4. Finished-game / vault linkage (derived from completed games only)
-- ---------------------------------------------------------------------------
create table if not exists public.finished_game_opening_matches (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  opening_family_id text references public.chess_opening_families (id),
  opening_line_id uuid references public.chess_opening_lines (id),
  player_id uuid references auth.users (id) on delete set null,
  player_color text check (player_color in ('white', 'black')),
  deviation_ply int,
  match_confidence text not null default 'pending'
    check (match_confidence in ('pending', 'low', 'medium', 'high')),
  created_at timestamptz not null default now(),
  constraint finished_game_opening_matches_game_uq unique (game_id)
);

comment on table public.finished_game_opening_matches is
  'Post-game opening classification. Populated only after games.status = finished.';

create table if not exists public.finished_game_tactic_extractions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid references auth.users (id) on delete set null,
  ply int,
  tactical_tag_id text references public.chess_tactical_tags (id),
  tactical_category_id text references public.chess_tactical_categories (id),
  outcome text check (outcome in ('missed', 'found', 'success', 'unknown')),
  engine_verified boolean not null default false,
  puzzle_eligible boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.finished_game_tactic_extractions is
  'Tactical moments extracted from finished games after engine verification. Training intake only.';

-- ---------------------------------------------------------------------------
-- 5. Player repertoire intelligence (derived — not canonical truth)
-- ---------------------------------------------------------------------------
create table if not exists public.player_repertoire_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opening_family_id text not null references public.chess_opening_families (id),
  color text not null check (color in ('white', 'black')),
  play_partition text not null default 'free'
    check (play_partition in ('free', 'tournament', 'trainer', 'unknown')),
  games_count int not null default 0 check (games_count >= 0),
  wins int not null default 0 check (wins >= 0),
  losses int not null default 0 check (losses >= 0),
  draws int not null default 0 check (draws >= 0),
  last_played_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint player_repertoire_entries_uq unique (user_id, opening_family_id, color, play_partition)
);

comment on table public.player_repertoire_entries is
  'Derived player opening usage stats. PROFILE/TRAINER/Repertoire only — not Nexus/Battlefield.';

create table if not exists public.player_opening_color_stats (
  user_id uuid not null references auth.users (id) on delete cascade,
  color text not null check (color in ('white', 'black')),
  play_partition text not null default 'free'
    check (play_partition in ('free', 'tournament', 'trainer', 'unknown')),
  games_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, color, play_partition)
);

comment on table public.player_opening_color_stats is
  'Aggregate opening activity by color/partition. Derived intelligence, reconstructable from finished games.';

-- ---------------------------------------------------------------------------
-- RLS: reference layers readable; writes service_role; linkage user-scoped read
-- ---------------------------------------------------------------------------
alter table public.chess_knowledge_sources enable row level security;
alter table public.chess_opening_families enable row level security;
alter table public.chess_opening_lines enable row level security;
alter table public.chess_tactical_categories enable row level security;
alter table public.chess_tactical_tags enable row level security;
alter table public.finished_game_opening_matches enable row level security;
alter table public.finished_game_tactic_extractions enable row level security;
alter table public.player_repertoire_entries enable row level security;
alter table public.player_opening_color_stats enable row level security;

revoke all on public.chess_knowledge_sources from public;
revoke all on public.chess_opening_families from public;
revoke all on public.chess_opening_lines from public;
revoke all on public.chess_tactical_categories from public;
revoke all on public.chess_tactical_tags from public;
revoke all on public.finished_game_opening_matches from public;
revoke all on public.finished_game_tactic_extractions from public;
revoke all on public.player_repertoire_entries from public;
revoke all on public.player_opening_color_stats from public;

grant select on public.chess_knowledge_sources to authenticated;
grant select on public.chess_opening_families to authenticated;
grant select on public.chess_opening_lines to authenticated;
grant select on public.chess_tactical_categories to authenticated;
grant select on public.chess_tactical_tags to authenticated;

grant select, insert, update, delete on public.chess_knowledge_sources to service_role;
grant select, insert, update, delete on public.chess_opening_families to service_role;
grant select, insert, update, delete on public.chess_opening_lines to service_role;
grant select, insert, update, delete on public.chess_tactical_categories to service_role;
grant select, insert, update, delete on public.chess_tactical_tags to service_role;
grant select, insert, update, delete on public.finished_game_opening_matches to service_role;
grant select, insert, update, delete on public.finished_game_tactic_extractions to service_role;
grant select, insert, update, delete on public.player_repertoire_entries to service_role;
grant select, insert, update, delete on public.player_opening_color_stats to service_role;

create policy chess_knowledge_sources_read on public.chess_knowledge_sources
  for select to authenticated using (true);

create policy chess_opening_families_read on public.chess_opening_families
  for select to authenticated using (true);

create policy chess_opening_lines_read on public.chess_opening_lines
  for select to authenticated using (true);

create policy chess_tactical_categories_read on public.chess_tactical_categories
  for select to authenticated using (true);

create policy chess_tactical_tags_read on public.chess_tactical_tags
  for select to authenticated using (true);

create policy finished_game_opening_matches_self_read on public.finished_game_opening_matches
  for select to authenticated
  using (
    exists (
      select 1 from public.games g
      where g.id = game_id
        and g.status = 'finished'
        and (g.white_player_id = auth.uid() or g.black_player_id = auth.uid())
    )
  );

create policy finished_game_tactic_extractions_self_read on public.finished_game_tactic_extractions
  for select to authenticated
  using (
    player_id = auth.uid()
    or exists (
      select 1 from public.games g
      where g.id = game_id
        and g.status = 'finished'
        and (g.white_player_id = auth.uid() or g.black_player_id = auth.uid())
    )
  );

create policy player_repertoire_entries_self on public.player_repertoire_entries
  for select to authenticated using (auth.uid() = user_id);

create policy player_opening_color_stats_self on public.player_opening_color_stats
  for select to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Seeds: opening families (MCO-15 concept — metadata only)
-- ---------------------------------------------------------------------------
insert into public.chess_opening_families (id, display_name, eco_family, move_prefix_san, source_label, strategic_theme_tags, risk_level)
values
  ('kings_gambit', 'King''s Gambit', 'C30', 'e4 e5 f4', 'MCO-15', array['attack', 'gambit'], 'high'),
  ('giuoco_piano', 'Giuoco Piano', 'C50', 'e4 e5 Nf3 Nc6 Bc4', 'MCO-15', array['development', 'classical'], 'low'),
  ('evans_gambit', 'Evans Gambit', 'C51', 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4', 'MCO-15', array['gambit', 'attack'], 'high'),
  ('two_knights', 'Two Knights'' Defense', 'C57', 'e4 e5 Nf3 Nc6 Bc4 Nf6', 'MCO-15', array['tactics', 'counterattack'], 'medium'),
  ('ruy_lopez', 'Ruy Lopez', 'C60', 'e4 e5 Nf3 Nc6 Bb5', 'MCO-15', array['classical', 'positional'], 'low'),
  ('sicilian', 'Sicilian Defense', 'B20', 'e4 c5', 'MCO-15', array['asymmetry', 'counterplay'], 'medium'),
  ('french', 'French Defense', 'C00', 'e4 e6', 'MCO-15', array['solid', 'structure'], 'low'),
  ('caro_kann', 'Caro-Kann Defense', 'B10', 'e4 c6', 'MCO-15', array['solid', 'structure'], 'low'),
  ('queens_gambit', 'Queen''s Gambit', 'D06', 'd4 d5 c4', 'MCO-15', array['center', 'positional'], 'low'),
  ('slav_semi_slav', 'Slav / Semi-Slav', 'D10', 'd4 d5 c4 c6', 'MCO-15', array['solid', 'structure'], 'low'),
  ('nimzo_indian', 'Nimzo-Indian Defense', 'E20', 'd4 Nf6 c4 e6 Nc3 Bb4', 'MCO-15', array['hypermodern', 'control'], 'medium'),
  ('kings_indian', 'King''s Indian Defense', 'E60', 'd4 Nf6 c4 g6', 'MCO-15', array['kingside_attack', 'dynamic'], 'medium'),
  ('english', 'English Opening', 'A10', 'c4', 'MCO-15', array['flank', 'flexible'], 'low'),
  ('reti', 'Réti Opening', 'A04', 'Nf3', 'MCO-15', array['flank', 'flexible'], 'low'),
  ('birds', 'Bird''s Opening', 'A02', 'f4', 'MCO-15', array['flank', 'attack'], 'medium'),
  ('larsens', 'Larsen''s Opening', 'A01', 'b3', 'MCO-15', array['flank', 'flexible'], 'medium'),
  ('misc_flank', 'Miscellaneous flank systems', 'A00', null, 'MCO-15', array['flank'], 'medium')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Seeds: tactical categories + tags (POLGAR-5334 taxonomy inspiration)
-- ---------------------------------------------------------------------------
insert into public.chess_tactical_categories (id, display_name, source_label, sort_order)
values
  ('mate_in_1', 'Mate in One', 'POLGAR-5334', 10),
  ('mate_in_2', 'Mate in Two', 'POLGAR-5334', 20),
  ('mate_in_3', 'Mate in Three', 'POLGAR-5334', 30),
  ('combination', 'Tactical Combination', 'POLGAR-5334', 40),
  ('miniature_game', 'Miniature Game', 'POLGAR-5334', 50),
  ('simple_endgame', 'Simple Endgame', 'POLGAR-5334', 60),
  ('tournament_combination', 'Tournament-Game Combination', 'POLGAR-5334', 70)
on conflict (id) do nothing;

insert into public.chess_tactical_tags (id, category_id, display_name)
values
  ('back_rank_mate', 'mate_in_1', 'Back rank mate'),
  ('mate_in_2_pattern', 'mate_in_2', 'Mate in two'),
  ('mate_in_3_pattern', 'mate_in_3', 'Mate in three'),
  ('discovered_attack', 'combination', 'Discovered attack'),
  ('double_attack', 'combination', 'Double attack'),
  ('pin', 'combination', 'Pin'),
  ('skewer', 'combination', 'Skewer'),
  ('deflection', 'combination', 'Deflection'),
  ('decoy', 'combination', 'Decoy'),
  ('clearance', 'combination', 'Clearance'),
  ('interference', 'combination', 'Interference'),
  ('attraction', 'combination', 'Attraction'),
  ('sacrifice', 'combination', 'Sacrifice'),
  ('mating_net', 'combination', 'Mating net'),
  ('overloaded_defender', 'combination', 'Overloaded defender'),
  ('trapped_king', 'combination', 'Trapped king'),
  ('promotion_tactic', 'simple_endgame', 'Promotion tactic'),
  ('endgame_tactic', 'simple_endgame', 'Endgame tactic'),
  ('defensive_resource', 'combination', 'Defensive resource'),
  ('perpetual_check', 'combination', 'Perpetual check'),
  ('stalemate_trick', 'combination', 'Stalemate trick'),
  ('fortress', 'simple_endgame', 'Fortress idea')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Guard: finished-only opening match insert (service_role)
-- ---------------------------------------------------------------------------
create or replace function public.upsert_finished_game_opening_match(
  p_game_id uuid,
  p_opening_family_id text,
  p_player_id uuid,
  p_player_color text,
  p_deviation_ply int default null,
  p_match_confidence text default 'pending'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if public.get_finished_game_analysis_intake(p_game_id) is null then
    raise exception 'finished_game_opening_match requires finished game intake';
  end if;

  insert into public.finished_game_opening_matches (
    game_id,
    opening_family_id,
    player_id,
    player_color,
    deviation_ply,
    match_confidence
  )
  values (
    p_game_id,
    p_opening_family_id,
    p_player_id,
    p_player_color,
    p_deviation_ply,
    coalesce(p_match_confidence, 'pending')
  )
  on conflict (game_id) do update set
    opening_family_id = excluded.opening_family_id,
    player_id = excluded.player_id,
    player_color = excluded.player_color,
    deviation_ply = excluded.deviation_ply,
    match_confidence = excluded.match_confidence
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.upsert_finished_game_opening_match is
  'Links opening classification to a finished game only (calls get_finished_game_analysis_intake).';

revoke all on function public.upsert_finished_game_opening_match from public;
grant execute on function public.upsert_finished_game_opening_match to service_role;
