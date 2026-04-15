-- Case-insensitive opponent resolution for direct challenge (client uses authenticated session).
-- Replaces fragile `.eq('username', normalized)` against mixed-case legacy rows and avoids
-- ILIKE wildcards on underscores in usernames.

create or replace function public.resolve_profile_for_challenge_lookup(
  p_username text default null,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_id uuid;
  v_username text;
  v_rating integer;
  v_email text;
  v_email_q text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_user_q text := nullif(lower(btrim(coalesce(p_username, ''))), '');
begin
  if v_email_q is not null and position('@' in v_email_q) > 0 then
    select pr.id, pr.username, pr.rating::integer, pr.email
    into v_id, v_username, v_rating, v_email
    from public.profiles pr
    where pr.email is not null
      and lower(btrim(pr.email)) = v_email_q
    limit 1;
  elsif v_user_q is not null then
    select pr.id, pr.username, pr.rating::integer, pr.email
    into v_id, v_username, v_rating, v_email
    from public.profiles pr
    where pr.username is not null
      and btrim(pr.username) <> ''
      and lower(btrim(pr.username)) = v_user_q
    limit 1;
  end if;

  if v_id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'username', v_username,
    'rating', coalesce(v_rating, 0),
    'email', v_email
  );
end;
$$;

comment on function public.resolve_profile_for_challenge_lookup(text, text) is
  'Resolve opponent profile id for direct challenge by ACCL username (case-insensitive) or account email; authenticated callers only.';

revoke all on function public.resolve_profile_for_challenge_lookup(text, text) from public;
grant execute on function public.resolve_profile_for_challenge_lookup(text, text) to authenticated;
