-- Hast Rekha — Supabase Schema
-- Run this in Supabase SQL Editor

-- Table 1: Every reading logged
create table if not exists palm_readings (
  id uuid primary key default gen_random_uuid(),
  subject_name text not null,
  subject_gender text,
  subject_age int,
  requester_email text,
  requester_ip text,
  is_pro boolean default false,
  reading_length int,
  created_at timestamptz default now()
);

create index if not exists idx_palm_readings_email on palm_readings(requester_email);
create index if not exists idx_palm_readings_created on palm_readings(created_at desc);

-- Table 2: Pro users (paid)
create table if not exists pro_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  token text not null,
  plan text default 'one_time',  -- 'one_time' | 'monthly' | 'lifetime'
  stripe_customer_id text,
  stripe_payment_id text,
  expires_at timestamptz,         -- null = no expiry
  created_at timestamptz default now()
);

create index if not exists idx_pro_users_email on pro_users(email);
create index if not exists idx_pro_users_token on pro_users(token);

-- Optional Table 3: OTP codes (if you wire up OTP email flow)
create table if not exists otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text not null,
  used boolean default false,
  expires_at timestamptz default (now() + interval '10 minutes'),
  created_at timestamptz default now()
);

create index if not exists idx_otp_email on otp_codes(email);

-- Optional: Daily usage view for analytics
create or replace view daily_readings as
select
  date_trunc('day', created_at)::date as day,
  count(*) as total_readings,
  count(*) filter (where is_pro) as pro_readings,
  count(*) filter (where not is_pro) as free_readings,
  count(distinct requester_email) as unique_emails,
  count(distinct requester_ip) as unique_ips
from palm_readings
group by 1
order by 1 desc;
