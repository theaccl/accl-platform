create table if not exists public.anti_cheat_enforcement_override_history (
  id bigserial primary key,
  acted_by uuid not null,
  target_user_id uuid not null,
  action text not null,
  reason text null,
  expires_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_ace_override_history_target_created
  on public.anti_cheat_enforcement_override_history (target_user_id, created_at desc);

create or replace function public.prevent_ace_override_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'anti_cheat_enforcement_override_history is append-only';
end;
$$;

drop trigger if exists trg_ace_override_history_prevent_update
  on public.anti_cheat_enforcement_override_history;
create trigger trg_ace_override_history_prevent_update
before update on public.anti_cheat_enforcement_override_history
for each row execute function public.prevent_ace_override_history_mutation();

drop trigger if exists trg_ace_override_history_prevent_delete
  on public.anti_cheat_enforcement_override_history;
create trigger trg_ace_override_history_prevent_delete
before delete on public.anti_cheat_enforcement_override_history
for each row execute function public.prevent_ace_override_history_mutation();
