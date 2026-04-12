-- Public player lookup RPC (privacy-safe discovery surface).
-- Lightweight username lookup for linking into existing public profiles.

create or replace function public.search_public_profiles(
  p_query text,
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q text := lower(trim(coalesce(p_query, '')));
  v_limit int := greatest(1, least(coalesce(p_limit, 25), 100));
begin
  -- Keep discovery lightweight and resistant to broad blind listing.
  if char_length(v_q) < 2 then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'username', nullif(trim(coalesce(p.username, '')), ''),
          'avatar_path', nullif(trim(coalesce(p.avatar_path, '')), ''),
          'created_at', p.created_at
        )
        order by
          strpos(lower(coalesce(p.username, '')), v_q),
          lower(coalesce(p.username, '')),
          p.created_at asc
      )
      from (
        select id, username, avatar_path, created_at
        from public.profiles
        where nullif(trim(coalesce(username, '')), '') is not null
          and lower(username) like ('%' || v_q || '%')
        limit v_limit
      ) p
    ),
    '[]'::jsonb
  );
end;
$$;

comment on function public.search_public_profiles(text, integer) is
  'Privacy-safe public player lookup by username. Returns curated profile identity fields only.';

revoke all on function public.search_public_profiles(text, integer) from public;
grant execute on function public.search_public_profiles(text, integer) to anon, authenticated;

