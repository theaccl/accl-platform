-- Allow structured engine artifacts alongside placeholder artifacts.
alter table public.finished_game_analysis_artifacts
  drop constraint if exists finished_game_analysis_artifacts_type_check;

alter table public.finished_game_analysis_artifacts
  add constraint finished_game_analysis_artifacts_type_check
  check (artifact_type in ('placeholder', 'engine_structured'));
