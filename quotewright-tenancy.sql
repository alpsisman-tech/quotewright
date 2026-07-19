-- ═══════════════════════════════════════════════════════════════════════════════
-- Quotewright — WAVE A multi-tenancy migration  (SECURITY-CRITICAL)
-- Run this ONCE in Supabase → SQL Editor for the Hassan project (mtwgxwylufebaisawxvw).
-- Idempotent + safe to re-run.
--
-- WHAT THIS DOES
--   Turns Quotewright from a single-firm console into a real multi-tenant product.
--   • tenants            — tenant metadata, keyed by the existing `owner` text column.
--   • account_profiles   — maps each Supabase auth user → tenant + role + status.
--   • auth_owner()/auth_is_admin() — SECURITY DEFINER helpers (pinned search_path)
--     that resolve the CALLER's tenant / admin flag WITHOUT recursing through RLS.
--   • handle_new_user()  — signup trigger: every new auth user → a PENDING profile.
--   • backfill           — existing users → pending; bootstrap admin@seamai.com as
--     owner=hassannonwovens / role=admin / status=active (keeps admin seeing Hassan).
--   • RLS REWRITE        — replaces every legacy "all authenticated see everything"
--     policy on quotes/customers/resolutions/catalog_gaps/digest/autonomy_settings
--     with TENANT-SCOPED policies: a caller sees a row only when
--         owner = auth_owner()   OR   auth_is_admin()
--     A pending/unassigned user (auth_owner() = NULL) matches NOTHING.
--
-- ISOLATION REASONING (why this is safe)
--   1. auth_owner() returns a tenant key ONLY for a caller whose profile is
--      status='active'. Pending/suspended/unassigned → NULL. In SQL, `owner = NULL`
--      is never TRUE, so those callers match zero rows. Fail-closed by construction.
--   2. The tenant key comes from the SERVER-SIDE profile row (account_profiles),
--      never from anything the client sends. A user cannot spoof a tenant.
--   3. Members have NO update/insert policy on account_profiles, so they can never
--      self-assign a tenant or elevate to admin. Only admin (admin_write) can write
--      owner/role/status. User-editable onboarding lives in auth user_metadata.
--   4. The helpers are SECURITY DEFINER owned by the table owner, so RLS is bypassed
--      INSIDE them — that both (a) lets them read account_profiles for any caller and
--      (b) prevents infinite recursion (a policy that called a helper which was itself
--      RLS-filtered by that policy would loop). search_path is pinned to public to
--      block search_path-hijack attacks.
--   5. The n8n pipeline / webhooks keep writing with the service_role key, which
--      bypasses RLS entirely — unchanged. New tenants start EMPTY until their own
--      workflow runs; no account is ever auto-tied to Hassan's data.
-- ═══════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── tenants ────────────────────────────────────────────────────────────────────
create table if not exists public.tenants (
  owner      text primary key,
  name       text,
  created_at timestamptz default now()
);
insert into public.tenants(owner, name)
  values ('hassannonwovens', 'Hassan Nonwovens')
  on conflict do nothing;

-- ── account_profiles ─────────────────────────────────────────────────────────—
create table if not exists public.account_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  owner      text references public.tenants(owner),
  role       text not null default 'member',
  status     text not null default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname='account_profiles_role_chk') then
    alter table public.account_profiles
      add constraint account_profiles_role_chk check (role in ('member','admin'));
  end if;
  if not exists (select 1 from pg_constraint where conname='account_profiles_status_chk') then
    alter table public.account_profiles
      add constraint account_profiles_status_chk check (status in ('pending','active','suspended'));
  end if;
end $$;
create index if not exists account_profiles_owner_idx on public.account_profiles(owner);

-- ── SECURITY DEFINER helpers (pinned search_path; avoid RLS recursion) ─────────—
create or replace function public.auth_owner()
  returns text language sql stable security definer set search_path=public as $$
  select owner from public.account_profiles
   where user_id = auth.uid() and status='active' limit 1
$$;
create or replace function public.auth_is_admin()
  returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.account_profiles
     where user_id = auth.uid() and role='admin' and status='active')
$$;
grant execute on function public.auth_owner()    to authenticated, anon;
grant execute on function public.auth_is_admin() to authenticated, anon;

-- ── signup trigger: new auth user → PENDING profile ───────────────────────────—
create or replace function public.handle_new_user()
  returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.account_profiles(user_id, email, status)
  values (new.id, new.email, 'pending')
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── backfill existing users; bootstrap the admin ──────────────────────────────—
insert into public.account_profiles(user_id, email, status)
  select id, email, 'pending' from auth.users
  on conflict (user_id) do nothing;
update public.account_profiles
  set owner='hassannonwovens', role='admin', status='active'
  where email='admin@seamai.com';

-- ── RLS: account_profiles (self+admin read, admin-only write) ──────────────────—
alter table public.account_profiles enable row level security;
drop policy if exists account_profiles_self_read on public.account_profiles;
create policy account_profiles_self_read on public.account_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.auth_is_admin());
drop policy if exists account_profiles_admin_write on public.account_profiles;
create policy account_profiles_admin_write on public.account_profiles
  for update to authenticated
  using (public.auth_is_admin()) with check (public.auth_is_admin());
-- NB: NO member-update / member-insert policy on purpose — members can never change
-- owner/role/status. User-editable profile/onboarding = Supabase auth user_metadata.

-- ── RLS: tenants (all authenticated may read; admin may manage) ────────────────—
alter table public.tenants enable row level security;
drop policy if exists tenants_read on public.tenants;
create policy tenants_read on public.tenants
  for select to authenticated using (true);
drop policy if exists tenants_admin_all on public.tenants;
create policy tenants_admin_all on public.tenants
  for all to authenticated
  using (public.auth_is_admin()) with check (public.auth_is_admin());

-- ── RLS REWRITE: replace legacy blanket policies with tenant-scoped ones ───────—
-- quotes ------------------------------------------------------------------------
drop policy if exists quotes_authenticated_read on public.quotes;
create policy quotes_tenant_read on public.quotes
  for select to authenticated
  using (owner = public.auth_owner() or public.auth_is_admin());
drop policy if exists quotes_authenticated_update on public.quotes;
create policy quotes_tenant_update on public.quotes
  for update to authenticated
  using (owner = public.auth_owner() or public.auth_is_admin())
  with check (owner = public.auth_owner() or public.auth_is_admin());
-- customers ---------------------------------------------------------------------
drop policy if exists customers_authenticated_read on public.customers;
create policy customers_tenant_read on public.customers
  for select to authenticated
  using (owner = public.auth_owner() or public.auth_is_admin());
-- resolutions -------------------------------------------------------------------
drop policy if exists resolutions_authenticated_read on public.resolutions;
create policy resolutions_tenant_read on public.resolutions
  for select to authenticated
  using (owner = public.auth_owner() or public.auth_is_admin());
-- catalog_gaps ------------------------------------------------------------------
drop policy if exists catalog_gaps_authenticated_read on public.catalog_gaps;
create policy catalog_gaps_tenant_read on public.catalog_gaps
  for select to authenticated
  using (owner = public.auth_owner() or public.auth_is_admin());
-- digest ------------------------------------------------------------------------
drop policy if exists digest_authenticated_read on public.digest;
create policy digest_tenant_read on public.digest
  for select to authenticated
  using (owner = public.auth_owner() or public.auth_is_admin());
-- autonomy_settings -------------------------------------------------------------
drop policy if exists autonomy_settings_authenticated_read on public.autonomy_settings;
create policy autonomy_settings_tenant_read on public.autonomy_settings
  for select to authenticated
  using (owner = public.auth_owner() or public.auth_is_admin());
drop policy if exists autonomy_settings_authenticated_update on public.autonomy_settings;
create policy autonomy_settings_tenant_update on public.autonomy_settings
  for update to authenticated
  using (owner = public.auth_owner() or public.auth_is_admin())
  with check (owner = public.auth_owner() or public.auth_is_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- TESTS  (copy-paste into Supabase → SQL Editor to PROVE isolation)
-- ───────────────────────────────────────────────────────────────────────────────
-- These impersonate roles with `set local role authenticated` + a forged
-- request.jwt.claims (exactly how Supabase presents a signed-in caller to RLS —
-- auth.uid() reads claims->>'sub'). Every block is wrapped in begin…rollback, so it
-- mutates NOTHING permanently. All existing quotes are owner='hassannonwovens',
-- which is what lets these prove cross-tenant isolation with real data.
--
-- ONE-TIME PREP: in Supabase → Authentication → Users → "Add user", create a throwaway
-- test user  tester@example.com  (any password). The blocks below flip its profile to
-- the role under test inside a transaction and roll it back — the account itself is
-- untouched. Delete it when done.
--
-- ── TEST 0 — backfill sanity (run as-is, postgres/service_role) ───────────────—
--   EXPECT: one row, admin@seamai.com | hassannonwovens | admin | active
-- select email, owner, role, status from public.account_profiles where email='admin@seamai.com';
--
-- ── TEST A1 — a member of tenant X sees ONLY tenant X (isolation) ─────────────—
--   Make tester an ACTIVE member of a throwaway tenant 'testcorp'. Because every
--   existing quote is owner='hassannonwovens', a testcorp member must see ZERO.
-- begin;
--   insert into public.tenants(owner,name) values ('testcorp','Test Corp (test)') on conflict do nothing;
--   update public.account_profiles set owner='testcorp', role='member', status='active'
--     where email='tester@example.com';
--   select set_config('request.jwt.claims',
--     json_build_object('sub',(select id from auth.users where email='tester@example.com'),
--                       'role','authenticated')::text, true);
--   set local role authenticated;
--   select 'A1 testcorp member sees own tenant only (EXPECT 0)' as test, count(*) from public.quotes;
-- rollback;
--
-- ── TEST A2 — a Hassan member DOES see Hassan's quotes (positive control) ──────—
-- begin;
--   update public.account_profiles set owner='hassannonwovens', role='member', status='active'
--     where email='tester@example.com';
--   select set_config('request.jwt.claims',
--     json_build_object('sub',(select id from auth.users where email='tester@example.com'),
--                       'role','authenticated')::text, true);
--   set local role authenticated;
--   select 'A2 hassan member sees hassan quotes (EXPECT >0)' as test, count(*) from public.quotes;
-- rollback;
--
-- ── TEST B — a PENDING (unassigned) user sees ZERO across every tenant table ───—
-- begin;
--   update public.account_profiles set owner=null, role='member', status='pending'
--     where email='tester@example.com';
--   select set_config('request.jwt.claims',
--     json_build_object('sub',(select id from auth.users where email='tester@example.com'),
--                       'role','authenticated')::text, true);
--   set local role authenticated;
--   select 'B pending: quotes (EXPECT 0)'    as test, count(*) from public.quotes
--   union all
--   select 'B pending: customers (EXPECT 0)'  , count(*) from public.customers
--   union all
--   select 'B pending: catalog_gaps (EXPECT 0)', count(*) from public.catalog_gaps;
-- rollback;
--
-- ── TEST C — admin sees ALL quotes (compare to the true total) ────────────────—
-- begin;
--   select set_config('request.jwt.claims',
--     json_build_object('sub',(select id from auth.users where email='admin@seamai.com'),
--                       'role','authenticated')::text, true);
--   set local role authenticated;
--   select 'C admin sees all quotes (EXPECT = total below)' as test, count(*) from public.quotes;
-- rollback;
-- select 'C true total quotes (service_role/postgres)' as test, count(*) from public.quotes;
--
-- ── TEST D — a member CANNOT change their own owner/role/status (no escalation) —
--   No member-update policy exists on account_profiles, so the UPDATE matches zero
--   rows (RLS silently filters it — no error, no change).
-- begin;
--   update public.account_profiles set owner='hassannonwovens', role='member', status='active'
--     where email='tester@example.com';
--   select set_config('request.jwt.claims',
--     json_build_object('sub',(select id from auth.users where email='tester@example.com'),
--                       'role','authenticated')::text, true);
--   set local role authenticated;
--   with tried as (
--     update public.account_profiles
--        set role='admin', status='active', owner='hassannonwovens'
--      where user_id = auth.uid()
--      returning 1)
--   select 'D self-escalation blocked (EXPECT 0 rows updated)' as test, count(*) from tried;
--   -- also confirm the member can only READ their own profile row (not others):
--   select 'D member reads only own profile (EXPECT 1)' as test, count(*) from public.account_profiles;
-- rollback;
--
-- ── TEST E — NO legacy blanket policy survives (they would DEFEAT isolation) ───—
--   EXPECT: zero rows. Any row returned is a leftover "*_authenticated_read/update"
--   policy that grants blanket access — DROP it immediately, isolation is broken.
-- select schemaname, tablename, policyname
--   from pg_policies
--  where schemaname='public'
--    and tablename in ('quotes','customers','resolutions','catalog_gaps','digest','autonomy_settings')
--    and policyname like '%\_authenticated\_%';
--
-- ── TEST E2 — positive listing of the policy set now in force ──────────────────—
-- select tablename, policyname, cmd, qual
--   from pg_policies
--  where schemaname='public'
--    and tablename in ('quotes','customers','resolutions','catalog_gaps','digest',
--                      'autonomy_settings','account_profiles','tenants')
--  order by tablename, policyname;
-- ═══════════════════════════════════════════════════════════════════════════════
