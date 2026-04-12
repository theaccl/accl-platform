-- Editable profile identity pass:
-- - Adds persisted bio/avatar identity fields on profiles.
-- - Adds trusted self-service identity update RPC.
-- - Adds profile avatar storage bucket + owner-scoped write policies.

alter table public.profiles
  add column if not exists bio text,
  add column if not exists avatar_path text;

comment on column public.profiles.bio is
  'Player-owned profile bio/about text. Publicly visible through curated profile read models.';

comment on column public.profiles.avatar_path is
  'Storage path in profile-avatars bucket for player profile image. Publicly visible through curated profile read models.';

create or replace function public.update_own_profile_identity(
  p_bio text default null,
  p_avatar_path text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_bio text;
  v_avatar_path text;
  v_row public.profiles%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  v_bio := nullif(trim(coalesce(p_bio, '')), '');
  if v_bio is not null and char_length(v_bio) > 500 then
    raise exception 'bio exceeds 500 characters';
  end if;

  v_avatar_path := nullif(trim(coalesce(p_avatar_path, '')), '');
  if v_avatar_path is not null then
    if left(v_avatar_path, 37) <> (v_uid::text || '/') then
      raise exception 'avatar_path must be namespaced under caller uid';
    end if;
  end if;

  update public.profiles
  set
    bio = v_bio,
    avatar_path = v_avatar_path
  where id = v_uid
  returning * into v_row;

  if not found then
    raise exception 'profile row not found for authenticated user';
  end if;

  return v_row;
end;
$$;

comment on function public.update_own_profile_identity(text, text) is
  'Trusted self-profile identity update RPC (bio/avatar). Caller can only update own profile row.';

revoke all on function public.update_own_profile_identity(text, text) from public;
grant execute on function public.update_own_profile_identity(text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_avatars_public_read" on storage.objects;
create policy "profile_avatars_public_read"
on storage.objects for select
to public
using (bucket_id = 'profile-avatars');

drop policy if exists "profile_avatars_owner_insert" on storage.objects;
create policy "profile_avatars_owner_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_avatars_owner_update" on storage.objects;
create policy "profile_avatars_owner_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-avatars'
  and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-avatars'
  and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_avatars_owner_delete" on storage.objects;
create policy "profile_avatars_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
);
