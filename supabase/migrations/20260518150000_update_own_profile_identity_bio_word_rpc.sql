-- Server-side bio word contract (150–250 words when bio is non-empty). Matches client + lib/profile.

create or replace function public.update_own_profile_identity(
  p_bio text default null,
  p_avatar_path text default null,
  p_flag text default null
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
  v_flag text;
  v_row public.profiles%rowtype;
  v_word_count int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  v_bio := nullif(trim(coalesce(p_bio, '')), '');

  if v_bio is not null then
    if char_length(v_bio) > 12000 then
      raise exception 'bio exceeds maximum length';
    end if;

    v_word_count := cardinality(regexp_split_to_array(v_bio, '\s+'));
    if v_word_count < 150 or v_word_count > 250 then
      raise exception 'Bio must be 150–250 words';
    end if;
  end if;

  v_avatar_path := nullif(trim(coalesce(p_avatar_path, '')), '');
  if v_avatar_path is not null then
    if left(v_avatar_path, 37) <> (v_uid::text || '/') then
      raise exception 'avatar_path must be namespaced under caller uid';
    end if;
  end if;

  v_flag := nullif(trim(coalesce(p_flag, '')), '');
  if v_flag is not null and char_length(v_flag) > 64 then
    raise exception 'flag exceeds maximum length';
  end if;

  update public.profiles
  set
    bio = v_bio,
    avatar_path = v_avatar_path,
    flag = v_flag
  where id = v_uid
  returning * into v_row;

  if not found then
    raise exception 'profile row not found for authenticated user';
  end if;

  return v_row;
end;
$$;

comment on function public.update_own_profile_identity(text, text, text) is
  'Trusted self-profile identity update RPC (bio/avatar/flag). Non-empty bio must be 150–250 words.';

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
  v_word_count int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  v_bio := nullif(trim(coalesce(p_bio, '')), '');

  if v_bio is not null then
    if char_length(v_bio) > 12000 then
      raise exception 'bio exceeds maximum length';
    end if;

    v_word_count := cardinality(regexp_split_to_array(v_bio, '\s+'));
    if v_word_count < 150 or v_word_count > 250 then
      raise exception 'Bio must be 150–250 words';
    end if;
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
