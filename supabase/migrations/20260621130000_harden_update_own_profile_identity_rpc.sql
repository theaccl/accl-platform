-- Compatibility-first hardening for deployed profile identity RPC (void return).
-- Production exposes update_own_profile_identity(text, text, text) returns void with
-- broad EXECUTE grants and no input validation. This migration closes that gap without
-- changing the PostgREST return contract yet.
--
-- ACCL_PROFILE_IDENTITY_RPC_RETURN_NORMALIZATION_REQUIRED

begin;

-- Three-argument signature has no parameter DEFAULTs so the two-argument compatibility
-- overload stays unambiguous (PostgreSQL rejects defaults before a non-default param).
create or replace function public.update_own_profile_identity(
  p_bio text,
  p_avatar_path text,
  p_flag text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid;
  v_bio text;
  v_avatar_path text;
  v_flag text;
  v_word_count integer;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'authentication required';
  end if;

  v_bio := nullif(btrim(coalesce(p_bio, '')), '');

  if v_bio is not null then
    if char_length(v_bio) > 12000 then
      raise exception 'bio exceeds maximum length';
    end if;

    v_word_count := cardinality(regexp_split_to_array(v_bio, '\s+'));

    if v_word_count < 150 or v_word_count > 250 then
      raise exception 'Bio must be 150–250 words';
    end if;
  end if;

  v_avatar_path := nullif(btrim(coalesce(p_avatar_path, '')), '');

  if v_avatar_path is not null
     and v_avatar_path not like (v_uid::text || '/%') then
    raise exception 'avatar_path must be namespaced under caller uid';
  end if;

  v_flag := upper(nullif(btrim(coalesce(p_flag, '')), ''));

  if v_flag is not null
     and v_flag <> 'OTHER'
     and v_flag !~ '^[A-Z]{2}$' then
    raise exception 'flag must be a two-letter country code, OTHER, or empty';
  end if;

  update public.profiles
  set
    bio = v_bio,
    avatar_path = v_avatar_path,
    flag = v_flag
  where id = v_uid;

  if not found then
    raise exception 'profile row not found for authenticated user';
  end if;
end;
$$;

comment on function public.update_own_profile_identity(text, text, text) is
  'Hardened self-profile identity update (bio/avatar/flag). Non-empty bio must be 150–250 words. Returns void for deployed compatibility.';

revoke all on function public.update_own_profile_identity(text, text, text) from public;
revoke all on function public.update_own_profile_identity(text, text, text) from anon;
revoke all on function public.update_own_profile_identity(text, text, text) from service_role;
grant execute on function public.update_own_profile_identity(text, text, text) to authenticated;

-- Two-argument compatibility wrapper: preserve existing flag when only bio/avatar change.
create or replace function public.update_own_profile_identity(
  p_bio text default null,
  p_avatar_path text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid;
  v_existing_flag text;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select p.flag
  into v_existing_flag
  from public.profiles p
  where p.id = v_uid;

  if not found then
    raise exception 'profile row not found for authenticated user';
  end if;

  perform public.update_own_profile_identity(p_bio, p_avatar_path, v_existing_flag);
end;
$$;

comment on function public.update_own_profile_identity(text, text) is
  'Compatibility wrapper: updates bio/avatar while preserving existing flag. Delegates to hardened 3-arg RPC.';

revoke all on function public.update_own_profile_identity(text, text) from public;
revoke all on function public.update_own_profile_identity(text, text) from anon;
revoke all on function public.update_own_profile_identity(text, text) from service_role;
grant execute on function public.update_own_profile_identity(text, text) to authenticated;

commit;
