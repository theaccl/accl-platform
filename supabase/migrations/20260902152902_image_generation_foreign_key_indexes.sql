begin;

-- PostgreSQL does not automatically index referencing columns. These indexes
-- keep candidate and saved-creation lineage checks efficient as history grows.
create index image_generation_refinements_source_candidate_idx
  on public.image_generation_refinements (source_candidate_id);

create index image_generation_requests_parent_saved_creation_idx
  on public.image_generation_requests (parent_saved_creation_id);

commit;
