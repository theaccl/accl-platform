-- A Pro commission may consume two distinct references. The reference row's
-- primary key and request reference columns prevent cross-request reuse; the
-- consumption pointer must therefore allow multiple rows for one request.

begin;

alter table public.image_generation_references
  drop constraint if exists image_generation_references_request_id_key;

create index if not exists image_generation_references_request_idx
  on public.image_generation_references (request_id)
  where request_id is not null;

commit;
