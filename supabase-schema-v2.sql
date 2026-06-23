-- Palmly — Supabase schema v2
-- Run in Supabase SQL Editor. Safe to re-run (idempotent where possible).
--
-- SECURITY MODEL: every table below has Row Level Security ENABLED with NO policies.
-- That means the anon/public key and end-user JWTs can read/write NOTHING. Only the
-- service_role key (used exclusively by our serverless functions) bypasses RLS.
-- Never expose SUPABASE_SERVICE_KEY to the browser.

-- ============================ verified users ============================
create table if not exists users (
  principal        text primary key,    -- "email:foo@bar.com" | "phone:+1..."
  channel          text not null,
  identifier       text not null,       -- display value (email or E.164 phone)
  bound_first_name text,                -- "one account = one person": set on first reading
  bound_age        int,
  created_at       timestamptz default now(),
  last_login       timestamptz default now()
);
-- bring v1 tables up to date
alter table users add column if not exists bound_first_name text;
alter table users add column if not exists bound_age int;
alter table users add column if not exists email text;   -- contact email (primary), captured at payment if signed in by phone

-- ============================== readings ===============================
create table if not exists readings (
  id              uuid primary key default gen_random_uuid(),
  owner           text not null,
  subject_name    text,
  subject_gender  text,
  subject_age     int,
  teaser          text,
  full_report     text,                 -- the gated content (text only; no images stored)
  unlocked        boolean default false,
  stripe_session_id text,
  buyer_email     text,
  created_at      timestamptz default now()
);
create index if not exists idx_readings_owner on readings(owner, created_at desc);
alter table readings add column if not exists buyer_email text;

-- ====================== daily horoscope subscribers =====================
create table if not exists subscriptions (
  owner               text primary key,
  email               text not null,
  full_name           text,
  dob                 date,
  birth_time          text,
  birthplace          text,
  timezone            text default 'UTC',
  relationship        text,
  focus               text,
  zodiac              text,             -- DERIVED from dob, never user input
  zodiac_element      text,
  life_path           int,
  chinese_zodiac      text,
  palm_signature      text,             -- distilled from palm photos; images never stored
  status              text default 'pending',  -- pending | active | past_due | canceled
  plan                text,             -- monthly | yearly
  stripe_customer_id  text,
  stripe_subscription_id text,
  current_period_end  timestamptz,
  last_sent_date      date,             -- dedupe daily sends (subscriber local date)
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
create index if not exists idx_subs_status on subscriptions(status);
create index if not exists idx_subs_stripe on subscriptions(stripe_subscription_id);

-- ========================= generated horoscopes =========================
create table if not exists daily_horoscopes (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid,
  owner           text not null,
  date            date not null,
  content         text not null,
  created_at      timestamptz default now(),
  unique (owner, date)
);
create index if not exists idx_horo_owner_date on daily_horoscopes(owner, date desc);

-- ============================== OTP codes ===============================
-- If you already have an otp_codes table (from v1), these alters bring it up to date.
create table if not exists otp_codes (
  id          uuid primary key default gen_random_uuid(),
  identifier  text,
  code_hash   text,
  attempts    int default 0,
  consumed    boolean default false,
  expires_at  timestamptz default (now() + interval '10 minutes'),
  created_at  timestamptz default now()
);
alter table otp_codes add column if not exists identifier text;
alter table otp_codes add column if not exists code_hash text;
alter table otp_codes add column if not exists attempts int default 0;
alter table otp_codes add column if not exists consumed boolean default false;
do $$ begin
  if exists (select 1 from information_schema.columns where table_name='otp_codes' and column_name='email' and is_nullable='NO')
  then alter table otp_codes alter column email drop not null; end if;
end $$;
create index if not exists idx_otp_identifier on otp_codes(identifier, created_at desc);

-- ============================ rate limiting =============================
create table if not exists rate_events (
  id          bigint generated always as identity primary key,
  bucket      text not null,
  created_at  timestamptz default now()
);
create index if not exists idx_rate_bucket on rate_events(bucket, created_at desc);

-- ===================== LOCK DOWN: RLS, no policies ======================
alter table users            enable row level security;
alter table readings         enable row level security;
alter table subscriptions    enable row level security;
alter table daily_horoscopes enable row level security;
alter table otp_codes        enable row level security;
alter table rate_events      enable row level security;
-- (palm_readings / pro_users from v1 — keep RLS on them too)
alter table if exists palm_readings enable row level security;
alter table if exists pro_users     enable row level security;

-- ===================== housekeeping (optional) ==========================
-- Enable pg_cron in Supabase, then schedule cleanup to keep tables small:
--   select cron.schedule('palmly_cleanup','*/30 * * * *', $$
--     delete from rate_events  where created_at < now() - interval '2 hours';
--     delete from otp_codes    where created_at < now() - interval '1 day';
--   $$);
