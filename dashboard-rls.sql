-- Quote console access control.
-- Run this ONCE in Supabase → SQL Editor for the Hassan project (mtwgxwylufebaisawxvw).
--
-- What it does: turns on Row Level Security for `quotes` and lets signed-in users
-- read their own firm's quotes. Anonymous visitors (anon key, not logged in) get
-- nothing. The n8n pipeline writes with the service_role key, which bypasses RLS, so
-- quote logging keeps working untouched.
--
-- ⚠️  RE-RUN SAFETY — READ BEFORE EDITING (cross-tenant leak hazard).
--   This file's SELECT policy used to be a blanket `using (true)` named
--   quotes_authenticated_read. That is correct ONLY on a pre-tenancy, single-firm
--   database. quotewright-tenancy.sql REPLACES it with the owner-scoped
--   `quotes_tenant_read`. Postgres OR's permissive policies together, so re-running
--   the OLD version of this file AFTER tenancy would put `using (true)` back ALONGSIDE
--   the tenant policy — the permissive one WINS and every tenant would read every
--   other tenant's quotes. The guarded DO block below now:
--     • ALWAYS drops the legacy blanket quotes_authenticated_read (so a re-run also
--       self-heals a DB where a prior run had re-opened the leak), and
--     • installs a fallback SELECT policy ONLY when tenancy's quotes_tenant_read is
--       absent, and even then scopes it to the owner — never a literal `using (true)`.
--   Net: safe to re-run in any order. Do NOT reintroduce an unconditional
--   `create policy ... using (true)` here. (Guard pattern mirrors clients-page.sql.)

alter table public.quotes enable row level security;

-- Signed-in users may READ their own firm's quotes. (Single-firm fallback scopes to
-- hassannonwovens; under multi-tenancy, quotewright-tenancy.sql's quotes_tenant_read
-- owns this and the block below is skipped.)
do $$
declare
  scope text;
begin
  -- Tenant-aware predicate when quotewright-tenancy.sql is applied; single-tenant
  -- fallback otherwise. Either way the caller must be `authenticated`.
  if to_regprocedure('public.auth_owner()') is not null then
    scope := '(owner = public.auth_owner() or public.auth_is_admin())';
  else
    scope := '(owner = ''hassannonwovens'')';
  end if;

  -- ALWAYS remove the legacy blanket SELECT policy: it must never coexist with an
  -- owner-scoped one (that coexistence IS the leak). No-op if it was never created.
  execute 'drop policy if exists quotes_authenticated_read on public.quotes';

  -- Install the fallback ONLY when tenancy has not already scoped quotes' SELECT.
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'quotes'
                   and policyname = 'quotes_tenant_read') then
    execute 'drop policy if exists quotes_owner_read on public.quotes';
    execute 'create policy quotes_owner_read on public.quotes
               for select to authenticated using ' || scope;
  end if;
end $$;

-- No insert/update/delete policies for authenticated here => the dashboard is
-- READ-ONLY from this file. (The pipeline's service_role writes bypass RLS.)

-- ── Create a login for the console ────────────────────────────────────────────
-- Supabase → Authentication → Users → "Add user" → set an email + password.
-- Optional: Authentication → Providers → Email → turn OFF "Enable sign-ups" so only
-- users you add by hand can ever exist.
