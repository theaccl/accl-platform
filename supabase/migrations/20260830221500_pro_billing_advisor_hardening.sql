-- Make the intentional service-only webhook event posture explicit to the RLS advisor.

begin;

create policy billing_subscription_webhook_events_no_user_access
  on public.billing_subscription_webhook_events
  for all
  to authenticated
  using (false)
  with check (false);

commit;
