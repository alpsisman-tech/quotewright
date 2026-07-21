-- Quotewright — CLIENTS PAGE: edit + delete capability for public.customers.
-- Run ONCE in Supabase → SQL Editor for the Hassan project (mtwgxwylufebaisawxvw),
-- AFTER quotewright-intelligence.sql (which creates public.customers).
-- Fully idempotent + additive — safe to re-run, wipes nothing.
--
-- WHAT THIS ENABLES
--   The Clients page (customers.html) was read-only. This migration adds:
--     1. `deleted_at` — a soft-delete marker. "Forget learned data" sets it; the
--        console hides those rows and offers Restore. Nothing is destroyed.
--     2. A partial index for the common lookup (active clients for one owner).
--     3. RLS policies so a SIGNED-IN console user may update + delete their own
--        firm's client rows, and delete their own firm's quotes (the "delete
--        everything" scope). The anon key still gets nothing.
--
-- WHY THE RLS PART MATTERS
--   The console runs in the browser with the PUBLIC anon key. There is no server
--   in front of it. The database is therefore the ONLY real authorization gate —
--   every policy below is `to authenticated` and scoped by owner, never
--   `using (true)` for a write. The n8n pipeline writes with the service_role key,
--   which bypasses RLS, so quote logging and customer upserts keep working.
--
-- MULTI-TENANCY
--   If quotewright-tenancy.sql has been applied, public.auth_owner() exists and the
--   policies below scope to the CALLER's tenant (with admins seeing everything).
--   If it hasn't, they fall back to the single-tenant scope owner='hassannonwovens'.
--   The DO blocks pick the right form automatically, so this file is correct in
--   either state and stays correct if you apply the tenancy migration later —
--   just re-run this file afterwards to upgrade the policies.
--
-- WHAT THIS DELIBERATELY DOES **NOT** TOUCH
--   public.resolutions and public.catalog_gaps. They have no customer column: they
--   are keyed on (owner, request_signature) and hold SHARED catalogue learning used
--   when matching lines for EVERY client. Deleting a client never deletes them —
--   doing so would degrade product matching for all the other customers.
--
-- KNOWN BEHAVIOUR (by design)
--   The pipeline upserts customers on (owner, lower(email)). If a soft-deleted
--   client emails again, the upsert updates that same row and it stays hidden until
--   someone restores it. If you'd rather new activity resurrect a client
--   automatically, add `deleted_at = null` to the pipeline's upsert SET list.

-- ── 1. soft-delete column ─────────────────────────────────────────────────────
alter table public.customers
  add column if not exists deleted_at timestamptz;

comment on column public.customers.deleted_at is
  'Soft delete. Non-null = hidden from the console list and ignored by the agent; restorable by setting it back to null.';

-- ── 2. indexes ────────────────────────────────────────────────────────────────
-- The list view: active clients for one owner, most recently seen first.
create index if not exists customers_owner_active_idx
  on public.customers (owner, last_seen desc) where deleted_at is null;

-- The "Recently deleted" view: soft-deleted clients for one owner, newest first.
create index if not exists customers_owner_deleted_idx
  on public.customers (owner, deleted_at desc) where deleted_at is not null;

-- The hard-delete / anonymise scopes match quotes by owner + customer name, which
-- is the only link between the two tables (quotes has no customer_id).
create index if not exists quotes_owner_customer_idx
  on public.quotes (owner, customer);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
alter table public.customers enable row level security;
alter table public.quotes    enable row level security;

do $$
declare
  -- Tenant-aware predicate when quotewright-tenancy.sql is applied; single-tenant
  -- fallback otherwise. Either way the caller must be `authenticated`.
  scope text;
begin
  if to_regprocedure('public.auth_owner()') is not null then
    scope := '(owner = public.auth_owner() or public.auth_is_admin())';
  else
    scope := '(owner = ''hassannonwovens'')';
  end if;

  -- customers: SELECT ---------------------------------------------------------
  -- quotewright-tenancy.sql already installs a correctly-scoped customers_tenant_read.
  -- Only replace the legacy unscoped policy (`using (true)`) when that one is absent,
  -- so we extend rather than duplicate.
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'customers'
                   and policyname = 'customers_tenant_read') then
    execute 'drop policy if exists customers_authenticated_read on public.customers';
    execute 'drop policy if exists customers_owner_read on public.customers';
    execute 'create policy customers_owner_read on public.customers
               for select to authenticated using ' || scope;
  end if;

  -- customers: UPDATE (edit fields, soft-delete, restore) ----------------------
  execute 'drop policy if exists customers_owner_update on public.customers';
  execute 'create policy customers_owner_update on public.customers
             for update to authenticated using ' || scope || ' with check ' || scope;

  -- customers: DELETE ("delete everything" scope) ------------------------------
  execute 'drop policy if exists customers_owner_delete on public.customers';
  execute 'create policy customers_owner_delete on public.customers
             for delete to authenticated using ' || scope;

  -- quotes: DELETE ("delete everything" scope) ---------------------------------
  -- quotes SELECT + UPDATE policies already exist (dashboard-rls.sql /
  -- quote-analytics.sql / quotewright-tenancy.sql). The anonymise scope reuses the
  -- existing UPDATE policy; only DELETE is new.
  execute 'drop policy if exists quotes_owner_delete on public.quotes';
  execute 'create policy quotes_owner_delete on public.quotes
             for delete to authenticated using ' || scope;
end $$;

-- No INSERT policy for `authenticated` anywhere here: clients are created by the
-- pipeline (service_role), never by hand in the console.

-- Defence in depth. RLS already returns nothing to `anon` (every policy above is
-- `to authenticated`), so removing the table grant changes no working behaviour —
-- it just makes the failure explicit instead of silent.
revoke all on public.customers from anon;

-- ── Sanity checks (run these by hand; all commented out) ──────────────────────
--
-- a) The column and indexes exist:
-- select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'customers' and column_name = 'deleted_at';
-- select indexname from pg_indexes
--   where schemaname = 'public' and indexname in
--     ('customers_owner_active_idx','customers_owner_deleted_idx','quotes_owner_customer_idx');
--
-- b) The policies are in place and none of the writes is a blanket using(true):
-- select tablename, policyname, cmd, roles, qual, with_check from pg_policies
--   where schemaname = 'public' and tablename in ('customers','quotes')
--   order by tablename, cmd, policyname;
--
-- c) Active vs soft-deleted split:
-- select count(*) filter (where deleted_at is null)     as active,
--        count(*) filter (where deleted_at is not null) as in_bin
--   from public.customers where owner = 'hassannonwovens';
--
-- d) Shared learning is untouched by any delete scope (these must never drop):
-- select 'resolutions' as t, count(*) from public.resolutions where owner = 'hassannonwovens'
-- union all
-- select 'catalog_gaps', count(*) from public.catalog_gaps where owner = 'hassannonwovens';
--
-- e) Undo a soft delete by hand if the console ever isn't available:
-- update public.customers set deleted_at = null
--   where owner = 'hassannonwovens' and name = '<client name>';
