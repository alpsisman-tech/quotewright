-- Quotewright — SETTINGS / ONBOARDING / PREFERENCES migration.
-- Run ONCE in Supabase → SQL Editor for the Hassan project (mtwgxwylufebaisawxvw),
-- AFTER quotewright-intelligence.sql (which creates public.autonomy_settings).
-- Fully idempotent + additive — safe to re-run, wipes nothing.
--
-- Extends the single-row-per-owner public.autonomy_settings table with the fields the
-- first-run onboarding wizard + the Settings hub read and write. Every column uses
-- `add column if not exists` with a sensible default, so:
--   * re-running is a no-op;
--   * the seeded hassannonwovens row instantly has every field at its default;
--   * the browser (authenticated UPDATE, see RLS below) can persist each field.
--
-- RLS: public.autonomy_settings already has (from quotewright-intelligence.sql):
--   * authenticated SELECT   — the wizard + hub read the current values;
--   * authenticated UPDATE   — the wizard + hub write (the anon key alone cannot).
-- The n8n pipeline / webhooks read these fields with the service_role key (bypasses RLS).
-- This file adds NO new policies — the existing ones already cover every read + write here.

-- ── Guard: create autonomy_settings if intelligence SQL hasn't been run yet ──────
-- (Normally quotewright-intelligence.sql owns this table. This block makes the
--  settings migration self-sufficient so it never fails on a fresh project.)
create table if not exists public.autonomy_settings (
  owner                text primary key,
  auto_send_enabled    boolean not null default false,
  green_min_confidence int     not null default 90,
  green_min_margin      numeric not null default 20,
  amber_min_confidence int     not null default 60,
  updated_at           timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Profile
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.autonomy_settings
  add column if not exists display_name text,
  add column if not exists company      text,
  add column if not exists role         text,
  add column if not exists phone        text,
  add column if not exists country      text,
  add column if not exists address      text,
  add column if not exists onboarded    boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────────────
-- Automation & autonomy
--   (auto_send_enabled + green/amber thresholds already exist on the table.)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.autonomy_settings
  add column if not exists auto_resolve_enabled boolean not null default false,  -- gates in-agent auto-resolve
  add column if not exists margin_floor         numeric not null default 15,     -- thin-margin threshold (scorer)
  add column if not exists followup_enabled     boolean not null default true,
  add column if not exists followup_days        int     not null default 5,
  add column if not exists max_followups        int     not null default 2,
  add column if not exists clarify_mode         text    not null default 'draft'; -- 'draft' | 'send'

-- ─────────────────────────────────────────────────────────────────────────────
-- Quoting voice
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.autonomy_settings
  add column if not exists reply_language     text not null default 'auto',  -- 'auto'|'en'|'tr'|'de'|'bg'|'fr'
  add column if not exists signature          text,
  add column if not exists quote_validity_days int  not null default 7,
  add column if not exists default_incoterm   text not null default 'EXW';

-- ─────────────────────────────────────────────────────────────────────────────
-- Notifications
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.autonomy_settings
  add column if not exists digest_enabled    boolean not null default true,
  add column if not exists alert_thin_margin boolean not null default true;

-- ─────────────────────────────────────────────────────────────────────────────
-- Extensibility — free-form future prefs without a migration
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.autonomy_settings
  add column if not exists preferences jsonb not null default '{}'::jsonb;

-- ── Value guards (idempotent) ────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'autonomy_clarify_mode_chk') then
    alter table public.autonomy_settings
      add constraint autonomy_clarify_mode_chk check (clarify_mode in ('draft','send'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'autonomy_reply_language_chk') then
    alter table public.autonomy_settings
      add constraint autonomy_reply_language_chk
      check (reply_language in ('auto','en','tr','de','bg','fr'));
  end if;
end $$;

-- ── Ensure the seeded row exists for the Hassan deployment (idempotent) ───────
insert into public.autonomy_settings (owner)
  values ('hassannonwovens')
  on conflict (owner) do nothing;

-- ── Verify (optional) ────────────────────────────────────────────────────────
-- select owner, onboarded, auto_resolve_enabled, margin_floor, followup_enabled,
--        reply_language, default_incoterm, quote_validity_days, digest_enabled
--   from public.autonomy_settings where owner = 'hassannonwovens';
