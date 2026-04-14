-- Case-insensitive unique usernames for public ACCL identity.
-- Format validation is enforced in application code (lib/usernameRules.ts).

drop index if exists public.profiles_username_lower_uidx;
create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(btrim(username)))
  where username is not null and btrim(username) <> '';

comment on index public.profiles_username_lower_uidx is
  'Case-insensitive unique public usernames for ACCL identity.';
