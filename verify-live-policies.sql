-- Quotewright — LIVE RLS POLICY AUDIT (read-only).
-- Run in Supabase → SQL Editor for the Hassan project (mtwgxwylufebaisawxvw).
-- Nothing here mutates anything — it only INSPECTS pg_policies so you can confirm the
-- live database has no cross-tenant blanket policy left over from a past run of an
-- older quotewright-intelligence.sql / dashboard-rls.sql / quote-analytics.sql.
--
-- WHY THIS EXISTS
--   Postgres OR's permissive policies. A single blanket `using (true)` (SELECT) or
--   `using(true) with check(true)` (write) sitting NEXT TO an owner-scoped `*_tenant_*`
--   policy defeats tenant isolation — the permissive one wins and every tenant sees
--   (or writes) every other tenant's rows. This audit surfaces any such leftover.

-- ── CHECK 1 — blanket WRITE policies (INSERT/UPDATE/DELETE). EXPECT: ZERO ROWS ───
--   Any row here is a blanket write grant across ALL tenants — DROP it immediately.
select tablename, policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and cmd <> 'SELECT'
   and (qual = 'true' or with_check = 'true');

-- ── CHECK 2 — blanket SELECT policies on the tenant tables. EXPECT: ZERO ROWS ────
--   A blanket `using (true)` SELECT on any tenant table lets every authenticated user
--   read every tenant's rows. (SELECT is split out from CHECK 1 because a blanket SELECT
--   is scoped here to the tenant tables — a harmless blanket SELECT could legitimately
--   exist on a genuinely public table, but NOT on these.)
select tablename, policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and cmd = 'SELECT'
   and qual = 'true'
   and tablename in ('quotes','customers','resolutions','catalog_gaps',
                     'digest','autonomy_settings');

-- ── CHECK 3 — positive listing: the owner-scoped policy set now in force ─────────
--   Every qual/with_check below should reference auth_owner()/auth_is_admin() (multi-
--   tenant) or owner = 'hassannonwovens' (single-firm fallback) — never a bare `true`.
select tablename, policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename in ('quotes','customers','resolutions','catalog_gaps',
                     'digest','autonomy_settings','account_profiles','tenants')
 order by tablename, cmd, policyname;

-- ── CLEANUP (commented) — run BY HAND only if CHECK 1 or CHECK 2 returned a row ──
--   Replace <table>/<policy> with the offending row, then re-run the matching
--   migration (quotewright-tenancy.sql, then re-run the guarded files) to be sure the
--   correct owner-scoped policy is (still) in place. These are the blanket names past
--   versions of the migrations created:
-- drop policy if exists customers_authenticated_read          on public.customers;
-- drop policy if exists resolutions_authenticated_read        on public.resolutions;
-- drop policy if exists catalog_gaps_authenticated_read       on public.catalog_gaps;
-- drop policy if exists digest_authenticated_read             on public.digest;
-- drop policy if exists autonomy_settings_authenticated_read  on public.autonomy_settings;
-- drop policy if exists autonomy_settings_authenticated_update on public.autonomy_settings;
-- drop policy if exists quotes_authenticated_read             on public.quotes;
-- drop policy if exists quotes_authenticated_update           on public.quotes;
-- -- ...then re-run quotewright-tenancy.sql to guarantee the *_tenant_* policies exist,
-- -- followed by quotewright-intelligence.sql / dashboard-rls.sql / quote-analytics.sql
-- -- (all guarded — they will NOT recreate a blanket policy).
