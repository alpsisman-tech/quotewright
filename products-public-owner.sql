-- Quotewright — PRODUCTS_PUBLIC: expose owner + enforce per-tenant catalogue isolation.
-- Run ONCE in Supabase → SQL Editor for the Hassan project (mtwgxwylufebaisawxvw),
-- AFTER quotewright-tenancy.sql and AFTER the products.owner column exists (migration 09).
-- Idempotent — safe to re-run.
--
-- WHY
--   The console's catalogue search reads the `products_public` view (sale-side columns
--   only — never cost/margin). The base `products` table is RLS-locked to the pipeline's
--   service_role, so the console can only see the catalogue THROUGH this view. Before
--   this migration the view had no `owner` column and no tenant filter, so every signed-in
--   tenant could search every tenant's catalogue. This migration:
--     1. adds `owner` to the view (so the console can scope its search), and
--     2. embeds an owner filter IN THE VIEW so isolation is enforced at the DATABASE,
--        not just by the client — a crafted query cannot read another tenant's catalogue.
--
-- HOW THE ISOLATION WORKS (and why cost stays hidden)
--   This is intentionally a *definer* view (the default; security_invoker is NOT set). It
--   runs as its owner and so bypasses `products` RLS — that is what lets the console read
--   the catalogue at all without granting `authenticated` a SELECT policy on `products`
--   (which would leak the COST columns). The embedded
--       where owner = public.auth_owner() or public.auth_is_admin()
--   then filters rows to the CALLER's tenant using auth.uid() from their JWT (admins see
--   all). Cost columns are simply never listed in the select, so they can never be read
--   through the view. Net: column-safe (no cost) AND row-safe (own tenant only).
--
-- HASSAN STAYS IDENTICAL
--   A Hassan member resolves auth_owner()='hassannonwovens' and every catalogue row is
--   owner='hassannonwovens', so the search returns exactly today's results. The admin
--   (auth_is_admin()) sees the whole catalogue, as before.
--
-- ⚠️  COLUMN SET — READ BEFORE RUNNING
--   The select list below is the SALE-SIDE column set the console needs plus common
--   spec columns. It DELIBERATELY excludes every cost/margin column (cost_*, converting_*,
--   maliyet_*, kar_orani, hammadde_*, amb_*, kumas_*, uretim_m2, gr_per_pack, …). If your
--   live products_public exposed extra SALE columns some other tool relies on, append them
--   to the select list before running — but NEVER add a cost column. The console tolerates
--   the exact shape (it selects named sale columns and falls back to `*`).

do $$
declare
  pred text;
begin
  -- Tenant filter when quotewright-tenancy.sql is applied; single-firm passthrough
  -- otherwise (pre-tenancy the DB has one tenant, so no per-row filter is needed and
  -- the console's own owner filter stays off).
  if to_regprocedure('public.auth_owner()') is not null then
    pred := 'where owner = public.auth_owner() or public.auth_is_admin()';
  else
    pred := '';
  end if;

  -- Recreate the view with `owner` exposed + the embedded tenant filter. DROP+CREATE
  -- (not create-or-replace) because we are adding the `owner` column, which a plain
  -- replace cannot do. The console (catalogSearch) is this view's only consumer.
  execute 'drop view if exists public.products_public';
  execute
    'create view public.products_public as ' ||
    'select sku, urun_adi, product_line, is_microfiber, data_complete, grup, birim, ' ||
    '       gsm, cloth_size, en_cm, boy_cm, color, edge_type, pieces_per_pack, ' ||
    '       packs_per_box, palet_koli, m2_per_pack, vadeli_gun, ' ||
    '       satis_eur, satis_usd, satis_usd_vadeli, owner ' ||
    '  from public.products ' || pred;

  -- PostgREST reaches the view as the `authenticated` (signed-in) or `anon` role.
  -- Grant SELECT so the console can read it; the embedded filter (or, for anon,
  -- auth_owner()=NULL → zero rows) does the scoping.
  execute 'grant select on public.products_public to authenticated, anon';
end $$;

-- ── Verify (optional) ────────────────────────────────────────────────────────────
-- 1) owner column is present and no cost column leaked:
-- select column_name from information_schema.columns
--   where table_schema='public' and table_name='products_public' order by column_name;
--   EXPECT: includes `owner`; contains NO column starting cost_/maliyet_/converting_/kar_/hammadde_.
-- 2) As the Hassan admin/member, the row count matches the catalogue (all owner=hassannonwovens).
