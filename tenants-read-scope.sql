-- Quotewright — tighten public.tenants SELECT to the caller's own tenant + admins.
-- OPTIONAL / RECOMMENDED. Run in Supabase → SQL Editor for the Hassan project
-- AFTER quotewright-tenancy.sql. Idempotent — safe to re-run.
--
-- WHY (and why it is a SEPARATE file, not an edit to quotewright-tenancy.sql)
--   quotewright-tenancy.sql installs `tenants_read` as `using (true)`: any authenticated
--   user (including a not-yet-approved pending user from another company) can list EVERY
--   tenant's owner-key and display name. Those are customer/company names — a mild
--   cross-tenant information leak (competitor / customer-base enumeration). This migration
--   narrows it to: a caller sees only their OWN tenant row, and admins see all.
--
-- SAFE TO APPLY — nothing legitimate breaks
--   The only client that reads public.tenants is admin.js (the admin console), and it
--   runs as an admin → auth_is_admin() is TRUE → it still sees every tenant. The
--   customer console (dashboard.js) never reads tenants. A member seeing only their own
--   tenant name is sufficient everywhere it is shown.
--
--   Leaving tenancy.sql's `using(true)` in place is also defensible if you consider tenant
--   NAMES non-sensitive — this file is a recommendation, not a correctness fix. If you
--   apply it and later re-run quotewright-tenancy.sql, that file will recreate the blanket
--   `tenants_read`; just re-run THIS file afterwards to re-tighten it.

alter table public.tenants enable row level security;

drop policy if exists tenants_read on public.tenants;
create policy tenants_read on public.tenants
  for select to authenticated
  using (owner = public.auth_owner() or public.auth_is_admin());

-- (tenants_admin_all from quotewright-tenancy.sql still governs admin writes — untouched.)

-- ── Verify (optional) ────────────────────────────────────────────────────────────
-- select policyname, cmd, qual from pg_policies
--   where schemaname='public' and tablename='tenants' order by policyname;
--   EXPECT tenants_read.qual to reference auth_owner()/auth_is_admin(), not `true`.
