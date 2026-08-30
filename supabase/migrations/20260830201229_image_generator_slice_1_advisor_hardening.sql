-- Image Generator Slice 1 staging advisor hardening.
-- Optimizes ownership policies, covers foreign keys, and converts the public
-- still-imagery reader to security invoker with column-scoped profile access.

begin;

drop policy if exists membership_entitlements_select_own on public.membership_entitlements;
create policy membership_entitlements_select_own
  on public.membership_entitlements for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists image_generation_requests_select_own on public.image_generation_requests;
create policy image_generation_requests_select_own
  on public.image_generation_requests for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists image_generation_candidates_select_own on public.image_generation_candidates;
create policy image_generation_candidates_select_own
  on public.image_generation_candidates for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists image_generation_approval_events_select_own on public.image_generation_approval_events;
create policy image_generation_approval_events_select_own
  on public.image_generation_approval_events for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists profile_imagery_assignments_select_own on public.profile_imagery_assignments;
create policy profile_imagery_assignments_select_own
  on public.profile_imagery_assignments for select to authenticated
  using (user_id = (select auth.uid()));

create index if not exists image_generation_approval_events_request_created_idx
  on public.image_generation_approval_events (request_id, created_at desc);
create index if not exists image_generation_approval_events_candidate_idx
  on public.image_generation_approval_events (candidate_id);
create index if not exists image_generation_approval_events_owner_created_idx
  on public.image_generation_approval_events (owner_id, created_at desc);
create index if not exists profile_imagery_assignments_candidate_idx
  on public.profile_imagery_assignments (candidate_id);

drop policy if exists profiles_public_imagery_select on public.profiles;
create policy profiles_public_imagery_select
  on public.profiles for select to anon
  using (true);

grant select (id, avatar_path, profile_background_path) on public.profiles to anon;

alter function public.get_public_profile_imagery(uuid) security invoker;

comment on function public.get_public_profile_imagery(uuid) is
  'Public still-only profile imagery projection. SECURITY INVOKER; anon access is limited to three explicitly granted profile columns.';

commit;
