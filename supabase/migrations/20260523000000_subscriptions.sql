-- =============================================================================
-- SaasCafes – Subscription tables
-- Tracks SaaS billing: one subscription per business, payments history
-- =============================================================================

-- Business subscriptions (one per tenant)
create table if not exists business_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null unique references businesses(id) on delete cascade,
  plan_type    text not null default 'custom'
                 check (plan_type in ('basico', 'pro', 'enterprise', 'custom')),
  monthly_fee  numeric(12, 2) not null check (monthly_fee >= 0),
  start_date   date not null,
  end_date     date not null,
  status       text not null default 'active'
                 check (status in ('active', 'expired', 'cancelled')),
  created_at   timestamptz not null default now(),
  check (end_date >= start_date)
);

-- Subscription payments history
create table if not exists subscription_payments (
  id               uuid primary key default gen_random_uuid(),
  subscription_id  uuid not null references business_subscriptions(id) on delete cascade,
  business_id      uuid not null references businesses(id) on delete cascade,
  amount           numeric(12, 2) not null check (amount >= 0),
  period_label     text not null,
  paid_at          date not null,
  payment_method   text not null default 'efectivo'
                     check (payment_method in ('efectivo', 'tarjeta', 'qr', 'transferencia')),
  is_late          boolean not null default false,
  notes            text,
  created_at       timestamptz not null default now()
);

-- Indexes
create index if not exists idx_business_subscriptions_business on business_subscriptions(business_id);
create index if not exists idx_subscription_payments_business  on subscription_payments(business_id);
create index if not exists idx_subscription_payments_sub       on subscription_payments(subscription_id);

-- RLS
alter table business_subscriptions enable row level security;
alter table subscription_payments   enable row level security;

-- Only super_admin can manage subscriptions (billing data)
create policy "super_admin full access to business_subscriptions"
  on business_subscriptions for all
  using (is_super_admin());

create policy "super_admin full access to subscription_payments"
  on subscription_payments for all
  using (is_super_admin());

-- Tenants can read their own subscription (e.g. show plan in admin panel)
create policy "users read own business subscription"
  on business_subscriptions for select
  using (business_id = current_user_business_id());
