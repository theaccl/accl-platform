begin;
alter table public.accl_badge_rank_bands enable row level security;
revoke all on table public.accl_badge_rank_bands from public;
revoke all on table public.accl_badge_rank_bands from anon;
revoke all on table public.accl_badge_rank_bands from authenticated;
revoke all on table public.accl_badge_rank_bands from service_role;
grant select on table public.accl_badge_rank_bands to anon;
grant select on table public.accl_badge_rank_bands to authenticated;
grant select on table public.accl_badge_rank_bands to service_role;
drop policy if exists "accl_badge_rank_bands_public_read"
  on public.accl_badge_rank_bands;
create policy "accl_badge_rank_bands_public_read"
  on public.accl_badge_rank_bands
  for select
  to anon, authenticated
  using (true);
comment on policy "accl_badge_rank_bands_public_read"
  on public.accl_badge_rank_bands is
  'Public read-only ACCL free-play badge rank-band registry; writes remain migration-owner controlled.';
commit;
