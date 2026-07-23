-- Quotewright — AUTO-SEED a tenant's autonomy_settings row (zero-touch provisioning).
-- Run ONCE in Supabase → SQL Editor for the Hassan project (mtwgxwylufebaisawxvw),
-- AFTER quotewright-tenancy.sql (creates public.tenants) and quotewright-settings.sql
-- (adds every autonomy_settings column + its DEFAULTs). Fully idempotent + additive —
-- safe to re-run, wipes nothing.
--
-- WHY THIS EXISTS
--   public.autonomy_settings holds ONE row per tenant (keyed by `owner`) and every
--   column has a sensible DEFAULT (see quotewright-settings.sql). Historically only
--   hassannonwovens had a row (seeded by hand). A NEW tenant had NO row, so the
--   console's settings + onboarding saves — `update ... where owner = <new tenant>` —
--   matched ZERO rows and silently persisted nothing. This migration makes the row
--   appear automatically for every tenant, with NO manual backend insert ever:
--
--     1. TRIGGER on public.tenants (BELT) — the instant a tenant is created (admin
--        console "Add tenant" → insert into public.tenants), a defaults-only
--        autonomy_settings row is seeded for that owner. SECURITY DEFINER, so it
--        bypasses RLS and needs zero client privilege. Provisioning is automatic.
--     2. BACKFILL (BELT) — seeds a defaults row for every EXISTING tenant lacking one
--        (covers hassannonwovens + any tenant created before this migration ran).
--     3. INSERT policy (SUSPENDERS) — owner-scoped, so the console's UPSERT save path
--        can create its OWN tenant's row if it is ever still missing. Owner-scoped
--        (never blanket `with check (true)`): a caller can only insert a row whose
--        owner is their own tenant; admins, any. No cross-tenant write is possible.
--
-- ⚠️  DEPLOY ORDER — IMPORTANT.
--   Run this file BEFORE (or together with) shipping the console build that UPSERTs
--   autonomy_settings (settings.js / console-onboarding.js). A PostgREST upsert issues
--   INSERT ... ON CONFLICT, and RLS rejects that INSERT unless an INSERT policy exists
--   — this file adds the (owner-scoped) INSERT policy. Deploying the new console
--   WITHOUT running this migration first would make settings saves start failing.
--
-- ISOLATION NOTE
--   The seeded row is defaults-only and carries no other tenant's data. The trigger
--   fires only on rows inserted into public.tenants (admin-gated: only admins can
--   write tenants, per quotewright-tenancy.sql), so it cannot be driven by a member.

-- ── 1. Seed defaults on tenant creation (BELT) ────────────────────────────────
-- Defaults-only insert: every autonomy_settings column has a DEFAULT, so listing only
-- `owner` produces a fully-defaulted row (clarify_mode 'draft', green_min_confidence 90,
-- green_min_margin 20, amber_min_confidence 60, margin_floor 15, followup_enabled true,
-- followup_days 5, max_followups 2, digest_enabled true, auto_send_enabled false,
-- auto_resolve_enabled false, reply_language 'auto', default_incoterm 'EXW',
-- quote_validity_days 7, alert_thin_margin true — all defined in quotewright-settings.sql).
create or replace function public.seed_autonomy_settings()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.autonomy_settings (owner)
    values (new.owner)
    on conflict (owner) do nothing;
  return new;
end $$;

-- The trigger only makes sense once public.tenants exists (quotewright-tenancy.sql).
do $$
begin
  if to_regclass('public.tenants') is not null then
    execute 'drop trigger if exists on_tenant_created on public.tenants';
    execute 'create trigger on_tenant_created
               after insert on public.tenants
               for each row execute function public.seed_autonomy_settings()';
  end if;
end $$;

-- ── 2. Backfill existing tenants (BELT) ───────────────────────────────────────
do $$
begin
  if to_regclass('public.tenants') is not null then
    insert into public.autonomy_settings (owner)
      select t.owner from public.tenants t
      on conflict (owner) do nothing;
  end if;
end $$;
-- Always make sure the Hassan row exists (works even before tenancy is applied).
insert into public.autonomy_settings (owner)
  values ('hassannonwovens')
  on conflict (owner) do nothing;

-- ── 3. Owner-scoped INSERT policy so the console UPSERT can self-heal (SUSPENDERS) ─
-- Tenant-aware when quotewright-tenancy.sql is applied; single-firm fallback otherwise.
-- WITH CHECK is owner-scoped, so a caller can only ever insert a row for their OWN
-- tenant (admins: any). This is NOT a blanket `with check (true)`.
alter table public.autonomy_settings enable row level security;
do $$
declare
  scope text;
begin
  if to_regprocedure('public.auth_owner()') is not null then
    scope := '(owner = public.auth_owner() or public.auth_is_admin())';
  else
    scope := '(owner = ''hassannonwovens'')';
  end if;
  execute 'drop policy if exists autonomy_settings_owner_insert on public.autonomy_settings';
  execute 'create policy autonomy_settings_owner_insert on public.autonomy_settings
             for insert to authenticated with check ' || scope;
end $$;

-- ── Verify (optional) ─────────────────────────────────────────────────────────
-- Every tenant should now have exactly one settings row:
-- select t.owner,
--        (select count(*) from public.autonomy_settings s where s.owner = t.owner) as rows
--   from public.tenants t order by t.owner;
-- The INSERT policy is owner-scoped (not blanket):
-- select policyname, cmd, with_check from pg_policies
--   where schemaname='public' and tablename='autonomy_settings' and cmd='INSERT';
