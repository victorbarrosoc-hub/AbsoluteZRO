begin;
-- Monthly card subscriptions through Stripe. Stripe is the source of truth for payment; this
-- table mirrors the latest subscription state the server read back from Stripe's API, and the
-- membership row carries the plan the quota functions already enforce.
create table if not exists nossom_private.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null unique,
  subscription_id text unique,
  plan_id text references nossom_private.plans(id),
  status text,
  period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table nossom_private.subscriptions enable row level security;
revoke all on nossom_private.subscriptions from public, anon, authenticated;

create or replace function public.nossom_subscription(p_action text, p_user uuid, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row nossom_private.subscriptions%rowtype;
  v_member nossom_private.memberships%rowtype;
  v_plan text := p_data->>'planId';
  v_status text := p_data->>'status';
  v_end timestamptz := (p_data->>'periodEnd')::timestamptz;
begin
  -- EXECUTE is granted only to service_role: the app calls it after reading its own session
  -- (get, customer) or after verifying a Stripe-signed event and fetching the subscription back
  -- from Stripe (apply). Browsers cannot call it.
  if p_user is null or not exists(select 1 from auth.users where id = p_user) then
    raise exception 'Account required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('subscription:' || p_user::text, 0));
  select * into v_row from nossom_private.subscriptions where user_id = p_user;
  if p_action = 'get' then
    return jsonb_build_object('subscription', case when v_row.user_id is null then null else to_jsonb(v_row) end);
  elsif p_action = 'customer' then
    if v_row.user_id is null then
      insert into nossom_private.subscriptions(user_id, customer_id) values (p_user, p_data->>'customerId') returning * into v_row;
    end if;
    -- An existing customer is kept: one Stripe customer per account.
    return jsonb_build_object('subscription', to_jsonb(v_row));
  elsif p_action <> 'apply' then
    raise exception 'Invalid action';
  end if;
  if v_row.user_id is null or v_row.customer_id <> p_data->>'customerId' then
    raise exception 'Customer does not belong to this account';
  end if;
  if v_plan not in ('essential', 'studio') or v_status is null or v_end is null then
    raise exception 'Invalid subscription';
  end if;
  -- A late event about an older, ended subscription must not end the newer one.
  if v_row.subscription_id is not null and v_row.subscription_id <> p_data->>'subscriptionId'
     and v_status not in ('active', 'trialing', 'past_due') then
    return jsonb_build_object('subscription', to_jsonb(v_row), 'ignored', true);
  end if;
  update nossom_private.subscriptions set subscription_id = p_data->>'subscriptionId', plan_id = v_plan,
    status = v_status, period_end = v_end, cancel_at_period_end = coalesce((p_data->>'cancelAtPeriodEnd')::boolean, false),
    updated_at = now() where user_id = p_user returning * into v_row;
  select * into v_member from nossom_private.memberships where user_id = p_user;
  if v_status in ('active', 'trialing', 'past_due') then
    -- Paid through the current period, with three days for Stripe's retries to settle.
    -- Blocking set by the ADM is kept; a plan change clears a per-account override.
    insert into nossom_private.memberships(user_id, plan_id, expires_at, blocked, updated_by)
      values (p_user, v_plan, v_end + interval '3 days', false, null)
    on conflict (user_id) do update set plan_id = excluded.plan_id, expires_at = excluded.expires_at,
      seconds_override = case when nossom_private.memberships.plan_id = excluded.plan_id then nossom_private.memberships.seconds_override end,
      updated_by = null, updated_at = now();
  elsif v_member.user_id is not null and v_member.updated_by is null and v_member.plan_id = v_plan then
    -- Ended or unpaid: a plan this subscription granted ends now. A plan the ADM set by hand stays.
    update nossom_private.memberships set expires_at = least(coalesce(expires_at, now()), now()), updated_at = now() where user_id = p_user;
  end if;
  insert into nossom_private.plan_audit(actor, target, action, details) values (null, p_user, 'stripe', p_data);
  return jsonb_build_object('subscription', to_jsonb(v_row));
end;
$$;
revoke all on function public.nossom_subscription(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.nossom_subscription(text, uuid, jsonb) to service_role;
commit;
