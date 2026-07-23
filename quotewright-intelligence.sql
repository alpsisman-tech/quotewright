-- Quotewright — INTELLIGENCE / LEARNING migration.
-- Run ONCE in Supabase → SQL Editor for the Hassan project (mtwgxwylufebaisawxvw),
-- exactly like dashboard-rls.sql / quote-analytics.sql / quotewright-expansion.sql.
-- Fully idempotent + additive — safe to re-run, wipes nothing.
--
-- Creates the copilot's DATA + LEARNING foundation:
--   customers          — customer memory (one row per recurring customer)
--   resolutions        — learning: human product picks/edits, keyed by request_signature
--   catalog_gaps       — learning: requested-but-missing items, keyed by request_signature
--   autonomy_settings  — per-owner confidence/margin gates (single row, dashboard-editable)
--   digest             — daily rollup the dashboard reads (learning & digest workflow writes it)
-- plus additive columns on public.quotes.
--
-- ⚠️⚠️  RE-RUN SAFETY — READ BEFORE EDITING (cross-tenant leak hazard) ⚠️⚠️
--   Section 7 of this file USED TO create blanket `using (true)` SELECT policies on
--   customers / resolutions / catalog_gaps / autonomy_settings / digest, plus a blanket
--   `using(true) with check(true)` UPDATE on autonomy_settings. That is correct ONLY on a
--   pre-tenancy, single-firm database. quotewright-tenancy.sql REPLACES each of them with
--   an owner-scoped `*_tenant_read` / `autonomy_settings_tenant_update` policy. Postgres
--   OR's permissive policies together, so re-running the OLD version of this file AFTER
--   tenancy would put the blanket policy BACK alongside the tenant one — the permissive
--   blanket WINS and every tenant would read (and, for autonomy_settings, WRITE) every
--   other tenant's rows. Section 7 is now GUARDED (see there): it always drops the blanket
--   policy and only installs an owner-scoped fallback when tenancy's policy is absent.
--   Net: safe to re-run in any order. Do NOT reintroduce an unconditional
--   `create policy ... using (true)` here. Verify a live DB with verify-live-policies.sql.
--
-- RLS model (owner-scoped; tenancy-aware):
--   * authenticated may SELECT their OWN tenant's rows on every new table
--     (owner = auth_owner() or admin; single-firm fallback owner='hassannonwovens').
--   * autonomy_settings: authenticated may UPDATE their OWN tenant's row (dashboard gates).
--   * everything else is written by the n8n pipeline / webhooks with the
--     service_role key, which BYPASSES RLS. The anon key can never read or write.
--
-- The canonical request_signature normalization rule (MUST match the pipeline +
-- webhooks byte-for-byte) is documented in INTELLIGENCE-SCHEMA.md. This file only
-- stores the already-normalized string.

-- ── extension (gen_random_uuid) ──────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. customers — customer memory
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  owner         text not null,
  email         text,
  domain        text,
  name          text,
  sap_code      text,
  quote_count   int  not null default 0,
  order_count   int  not null default 0,
  first_seen    timestamptz default now(),
  last_seen     timestamptz default now(),
  currency_pref text,
  preferences   jsonb not null default '{}'::jsonb,   -- learned prefs (colour, edge, units…)
  history       jsonb not null default '[]'::jsonb,   -- last N products quoted
  notes         text
);

-- one memory row per (owner,email); the pipeline upserts on this key every quote
create unique index if not exists customers_owner_email_key
  on public.customers (owner, lower(email)) where email is not null;
create index if not exists customers_owner_idx   on public.customers (owner);
create index if not exists customers_domain_idx  on public.customers (owner, lower(domain));
create index if not exists customers_sapcode_idx on public.customers (owner, sap_code);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. resolutions — learning: human product picks / edits
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.resolutions (
  id                uuid primary key default gen_random_uuid(),
  owner             text not null,
  request_signature text not null,          -- canonical key (see INTELLIGENCE-SCHEMA.md)
  chosen_sku        text not null,
  chosen_by         text,                   -- console user email who resolved
  quote_id          text,
  source            text,                   -- 'dashboard' | 'reply' | 'auto' …
  created_at        timestamptz not null default now()
);

-- the pipeline reads the LATEST resolution for (owner,request_signature) before flagging
create index if not exists resolutions_owner_sig_idx
  on public.resolutions (owner, request_signature, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. catalog_gaps — learning: requested-but-missing items
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.catalog_gaps (
  id                uuid primary key default gen_random_uuid(),
  owner             text not null,
  request_signature text not null,
  description       text,
  count             int  not null default 1,
  last_requested    timestamptz not null default now(),
  example_quote_id  text,
  status            text not null default 'open'   -- 'open' | 'resolved' | 'ignored'
);

-- upserted per weak line: increment count on repeat requests for the same signature
create unique index if not exists catalog_gaps_owner_sig_key
  on public.catalog_gaps (owner, request_signature);
create index if not exists catalog_gaps_owner_status_idx
  on public.catalog_gaps (owner, status);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalog_gaps_status_chk') then
    alter table public.catalog_gaps
      add constraint catalog_gaps_status_chk check (status in ('open','resolved','ignored'));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. autonomy_settings — per-owner confidence/margin gates (single row)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.autonomy_settings (
  owner                text primary key,
  auto_send_enabled    boolean not null default false,  -- OPT-IN; never auto-send by default
  green_min_confidence int     not null default 90,
  green_min_margin      numeric not null default 20,
  amber_min_confidence int     not null default 60,
  updated_at           timestamptz not null default now()
);

-- seed the single row for the Hassan deployment (idempotent)
insert into public.autonomy_settings (owner)
  values ('hassannonwovens')
  on conflict (owner) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. digest — daily rollup the dashboard reads (written by the Learning & Digest wf)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.digest (
  id                uuid primary key default gen_random_uuid(),
  owner             text not null,
  digest_date       date not null default current_date,
  generated_at      timestamptz not null default now(),
  open_needs_info   int  not null default 0,   -- quotes with unresolved pending_info lines
  needs_approval    int  not null default 0,   -- thin-margin / needs_approval quotes open
  recent_replies    int  not null default 0,   -- customer replies in the window
  customers_total   int  not null default 0,
  gaps_open         int  not null default 0,
  top_gaps          jsonb not null default '[]'::jsonb,  -- [{request_signature, description, count}]
  summary           jsonb not null default '{}'::jsonb   -- free-form extra metrics
);

-- one row per (owner, day); the rollup upserts today's row, dashboard reads the latest
create unique index if not exists digest_owner_date_key
  on public.digest (owner, digest_date);
create index if not exists digest_owner_gen_idx
  on public.digest (owner, generated_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. extend public.quotes — copilot columns
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.quotes
  add column if not exists gmail_thread_id text,
  add column if not exists gmail_draft_id  text,
  add column if not exists autonomy_tier   text,          -- 'green' | 'amber' | 'red'
  add column if not exists sent_at         timestamptz,
  add column if not exists sent_by         text,
  add column if not exists last_reply_text text,
  add column if not exists thread_snapshot jsonb;         -- messages array for dashboard thread view

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quotes_autonomy_tier_chk') then
    alter table public.quotes
      add constraint quotes_autonomy_tier_chk
      check (autonomy_tier is null or autonomy_tier in ('green','amber','red'));
  end if;
end $$;

create index if not exists quotes_gmail_thread_idx on public.quotes (gmail_thread_id);
create index if not exists quotes_autonomy_tier_idx on public.quotes (autonomy_tier);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS — enable + GUARDED owner-scoped policies on the new tables.
--    Owner-scoped SELECT on all; owner-scoped UPDATE only on autonomy_settings.
--    NEVER a blanket using(true) (see the ⚠️ banner at the top of this file).
--    (quotes already has read + update policies from dashboard-rls / quote-analytics.)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.customers         enable row level security;
alter table public.resolutions       enable row level security;
alter table public.catalog_gaps      enable row level security;
alter table public.autonomy_settings enable row level security;
alter table public.digest            enable row level security;

-- GUARDED policy install (mirrors clients-page.sql / dashboard-rls.sql / quote-analytics.sql).
-- For EVERY table below we ALWAYS drop the legacy blanket `*_authenticated_read`
-- (and the blanket autonomy_settings_authenticated_update) so a re-run self-heals a DB
-- where a prior run of THIS file had re-opened the leak next to tenancy's scoped policy.
-- We (re)install an owner-scoped fallback ONLY when tenancy's tenant-scoped policy is
-- absent — and even then it is owner-scoped, NEVER a literal `using (true)`. The
-- tenant policy names we key on come from quotewright-tenancy.sql:
--   customers_tenant_read · resolutions_tenant_read · catalog_gaps_tenant_read ·
--   digest_tenant_read · autonomy_settings_tenant_read · autonomy_settings_tenant_update.
do $$
declare
  scope text;
begin
  -- Tenant-aware predicate when quotewright-tenancy.sql is applied; single-tenant
  -- fallback otherwise. Either way the caller must be `authenticated` and owner-scoped.
  if to_regprocedure('public.auth_owner()') is not null then
    scope := '(owner = public.auth_owner() or public.auth_is_admin())';
  else
    scope := '(owner = ''hassannonwovens'')';
  end if;

  -- customers: SELECT ----------------------------------------------------------
  execute 'drop policy if exists customers_authenticated_read on public.customers';
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='customers'
                   and policyname='customers_tenant_read') then
    execute 'drop policy if exists customers_owner_read on public.customers';
    execute 'create policy customers_owner_read on public.customers
               for select to authenticated using ' || scope;
  end if;

  -- resolutions: SELECT --------------------------------------------------------
  execute 'drop policy if exists resolutions_authenticated_read on public.resolutions';
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='resolutions'
                   and policyname='resolutions_tenant_read') then
    execute 'drop policy if exists resolutions_owner_read on public.resolutions';
    execute 'create policy resolutions_owner_read on public.resolutions
               for select to authenticated using ' || scope;
  end if;

  -- catalog_gaps: SELECT -------------------------------------------------------
  execute 'drop policy if exists catalog_gaps_authenticated_read on public.catalog_gaps';
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='catalog_gaps'
                   and policyname='catalog_gaps_tenant_read') then
    execute 'drop policy if exists catalog_gaps_owner_read on public.catalog_gaps';
    execute 'create policy catalog_gaps_owner_read on public.catalog_gaps
               for select to authenticated using ' || scope;
  end if;

  -- digest: SELECT -------------------------------------------------------------
  execute 'drop policy if exists digest_authenticated_read on public.digest';
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='digest'
                   and policyname='digest_tenant_read') then
    execute 'drop policy if exists digest_owner_read on public.digest';
    execute 'create policy digest_owner_read on public.digest
               for select to authenticated using ' || scope;
  end if;

  -- autonomy_settings: SELECT --------------------------------------------------
  execute 'drop policy if exists autonomy_settings_authenticated_read on public.autonomy_settings';
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='autonomy_settings'
                   and policyname='autonomy_settings_tenant_read') then
    execute 'drop policy if exists autonomy_settings_owner_read on public.autonomy_settings';
    execute 'create policy autonomy_settings_owner_read on public.autonomy_settings
               for select to authenticated using ' || scope;
  end if;

  -- autonomy_settings: UPDATE (dashboard edits the confidence/margin gates) -----
  -- `to authenticated` + owner scope IS the server-side authorization; the anon key
  -- alone can never write. Pipeline/webhook writes use service_role and bypass RLS.
  execute 'drop policy if exists autonomy_settings_authenticated_update on public.autonomy_settings';
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='autonomy_settings'
                   and policyname='autonomy_settings_tenant_update') then
    execute 'drop policy if exists autonomy_settings_owner_update on public.autonomy_settings';
    execute 'create policy autonomy_settings_owner_update on public.autonomy_settings
               for update to authenticated using ' || scope || ' with check ' || scope;
  end if;
end $$;

-- No INSERT/UPDATE/DELETE policies on customers / resolutions / catalog_gaps / digest
-- for authenticated => those are written only by service_role (pipeline + webhooks).

-- ── Verify (optional) ────────────────────────────────────────────────────────
-- select * from public.autonomy_settings where owner = 'hassannonwovens';
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public'
--     and tablename in ('customers','resolutions','catalog_gaps','autonomy_settings','digest');
