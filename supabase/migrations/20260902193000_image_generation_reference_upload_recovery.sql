-- Register private reference uploads before object creation so an interrupted
-- request always leaves a durable path that maintenance can safely recover.

begin;

alter table public.image_generation_references
  drop constraint image_generation_references_status_check,
  add constraint image_generation_references_status_check
    check (status in ('pending_upload', 'ready', 'cleanup_pending', 'deleted', 'rejected'));

alter table public.image_generation_references
  alter column status set default 'pending_upload';

drop index image_generation_references_cleanup_idx;
create index image_generation_references_cleanup_idx
  on public.image_generation_references (expires_at, id)
  where status in ('pending_upload', 'ready', 'cleanup_pending');

commit;
