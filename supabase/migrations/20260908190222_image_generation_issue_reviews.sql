begin;

create table public.image_generation_issue_reports (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.image_generation_requests(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('technical_failure', 'unusable_result', 'prompt_mismatch', 'other')),
  details text not null check (char_length(details) between 10 and 2000),
  review_method text not null check (review_method in ('manual', 'ai')),
  status text not null check (status in ('pending_ai', 'reviewing_ai', 'pending_manual', 'approved', 'rejected')),
  ai_model text,
  ai_assessment jsonb,
  ai_started_at timestamptz,
  ai_deadline timestamptz,
  reviewer_type text check (reviewer_type in ('manual', 'ai')),
  reviewer_id uuid references auth.users(id) on delete set null,
  resolution_note text check (char_length(resolution_note) <= 1000),
  replacement_amount integer not null default 0 check (replacement_amount between 0 and 1),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index image_generation_issue_owner_idx on public.image_generation_issue_reports(owner_id, created_at desc);
create index image_generation_issue_queue_idx on public.image_generation_issue_reports(created_at)
  where status in ('pending_ai', 'reviewing_ai', 'pending_manual');
create index image_generation_issue_reviewer_idx on public.image_generation_issue_reports(reviewer_id)
  where reviewer_id is not null;
alter table public.image_generation_issue_reports enable row level security;
revoke all on public.image_generation_issue_reports from public, anon, authenticated;
grant all on public.image_generation_issue_reports to service_role;
-- Owner-facing data is returned through the authenticated API. Evidence and
-- reviewer identifiers are service-only, with no browser write grants.

alter table public.generation_token_ledger drop constraint generation_token_ledger_event_type_check;
alter table public.generation_token_ledger add constraint generation_token_ledger_event_type_check check (event_type in (
  'rating_milestone_mint', 'plus_weekly_mint', 'pro_weekly_mint', 'pro_anniversary_mint',
  'commission_reservation', 'commission_spend', 'commission_refund', 'generator_issue_replacement',
  'administrative_adjustment', 'internal_unlimited_commission', 'rating_bracket_award',
  'weekly_allowance', 'membership_anniversary', 'support_adjustment'
));

create function public.submit_image_generation_issue(p_request_id uuid, p_owner_id uuid, p_category text, p_details text, p_review_method text)
returns public.image_generation_issue_reports language plpgsql security definer set search_path = public as $$
declare
  v_report public.image_generation_issue_reports;
begin
  perform 1 from public.image_generation_requests where id = p_request_id and owner_id = p_owner_id for update;
  if not found then raise exception 'Generation not found' using errcode = 'P0002'; end if;
  select * into v_report from public.image_generation_issue_reports where request_id = p_request_id;
  if found then return v_report; end if;
  perform 1 from public.generation_token_redemptions
    where generation_request_id = p_request_id and user_id = p_owner_id and spent_at is not null;
  if not found then raise exception 'Commission has not spent a token' using errcode = 'P0001'; end if;
  insert into public.image_generation_issue_reports(request_id, owner_id, category, details, review_method, status)
    values (p_request_id, p_owner_id, p_category, trim(p_details), p_review_method,
      case when p_review_method = 'ai' then 'pending_ai' else 'pending_manual' end)
    returning * into v_report;
  return v_report;
end;
$$;

create function public.claim_image_generation_issue_ai(p_report_id uuid, p_model text)
returns public.image_generation_issue_reports language sql security definer set search_path = public as $$
  update public.image_generation_issue_reports
    set status = 'reviewing_ai', ai_model = p_model, ai_started_at = now(), ai_deadline = now() + interval '60 seconds'
    where id = p_report_id and status = 'pending_ai' and char_length(trim(p_model)) between 1 and 200
    returning *;
$$;

create function public.resolve_image_generation_issue(
  p_report_id uuid, p_decision text, p_reviewer_type text, p_reviewer_id uuid,
  p_note text, p_assessment jsonb default null
)
returns public.image_generation_issue_reports language plpgsql security definer set search_path = public as $$
declare
  v_request_id uuid;
  v_report public.image_generation_issue_reports;
  v_redemption public.generation_token_redemptions;
  v_amount integer := 0;
begin
  if p_decision is null or p_decision not in ('approved', 'rejected', 'pending_manual')
    or p_reviewer_type is null or p_reviewer_type not in ('manual', 'ai', 'system')
    or char_length(trim(coalesce(p_note, ''))) not between 1 and 1000 then
    raise exception 'Invalid review decision';
  end if;
  if p_reviewer_type = 'manual' and p_reviewer_id is null then raise exception 'Reviewer required'; end if;
  if p_reviewer_type <> 'manual' and p_decision = 'rejected' then raise exception 'Manual decision required'; end if;
  if p_reviewer_type = 'system' and p_decision <> 'pending_manual' then raise exception 'System may only hand off'; end if;
  select request_id into v_request_id from public.image_generation_issue_reports where id = p_report_id;
  if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;
  -- Existing commission workers lock request -> redemption -> account. Keep that
  -- order here too. The report lock serializes manual decisions and late AI results.
  perform 1 from public.image_generation_requests where id = v_request_id for update;
  select * into v_report from public.image_generation_issue_reports where id = p_report_id for update;
  if v_report.status in ('approved', 'rejected') then return v_report; end if;
  if p_reviewer_type = 'ai' and (v_report.status <> 'reviewing_ai' or v_report.ai_deadline <= now()) then
    return v_report;
  end if;
  if p_decision = 'approved' then
    select * into v_redemption from public.generation_token_redemptions where generation_request_id = v_request_id for update;
    if not found or v_redemption.user_id <> v_report.owner_id or v_redemption.spent_at is null then
      raise exception 'Spent commission required';
    end if;
    if v_redemption.state = 'spent' and v_redemption.token_cost > 0 then
      -- Reuse the same restitution lock and source key as automatic recovery.
      -- This keeps the original spend entry and lifetime_spent audit intact,
      -- while preventing a later failure refund from paying a second token.
      perform public.transition_generation_token_redemption(v_request_id, 'refund');
      v_amount := v_redemption.token_cost;
      update public.generation_token_ledger
        set event_type = 'generator_issue_replacement',
          metadata = metadata || jsonb_build_object('report_id', p_report_id, 'reviewer_type', p_reviewer_type, 'reviewer_id', p_reviewer_id)
        where source_key = 'commission-refund:' || v_request_id::text;
    end if;
  end if;
  update public.image_generation_issue_reports
    set status = p_decision,
      reviewer_type = case when p_decision <> 'pending_manual' then p_reviewer_type else null end,
      reviewer_id = case when p_reviewer_type = 'manual' then p_reviewer_id else null end,
      resolution_note = trim(p_note),
      ai_assessment = case when p_reviewer_type in ('ai', 'system') then p_assessment else ai_assessment end,
      replacement_amount = v_amount,
      resolved_at = case when p_decision <> 'pending_manual' then now() else null end
    where id = p_report_id returning * into v_report;
  return v_report;
end;
$$;

revoke all on function public.submit_image_generation_issue(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_image_generation_issue_ai(uuid, text) from public, anon, authenticated;
revoke all on function public.resolve_image_generation_issue(uuid, text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_image_generation_issue(uuid, uuid, text, text, text) to service_role;
grant execute on function public.claim_image_generation_issue_ai(uuid, text) to service_role;
grant execute on function public.resolve_image_generation_issue(uuid, text, text, uuid, text, jsonb) to service_role;
commit;
