-- Quotewright — TENANT INBOXES (dispatcher routing foundation).
-- Run ONCE in Supabase → SQL Editor for the Hassan project (mtwgxwylufebaisawxvw).
-- Idempotent + additive — safe to re-run, wipes nothing.
--
-- THE DISPATCHER MODEL (why this table exists)
--   Today the n8n pipeline is hard-coded to owner='hassannonwovens'. That does not
--   scale: a second customer needs its OWN owner without editing the workflow. This
--   table is the mapping that lets the pipeline DERIVE the owner from the RFQ instead
--   of hard-coding it: the inbox an RFQ landed in → the tenant that owns it.
--
--     RFQ arrives in inbox  ──►  lookup tenant_inboxes[inbox_address]  ──►  owner
--                                     (service_role read)                (tag every
--                                                                         row written)
--
--   The pipeline reads this table with the service_role key (bypasses RLS) at the top
--   of a run, resolves `owner`, and stamps that owner onto every quote / customer /
--   resolution / gap it writes. No blanket owner literal anywhere in the workflow.
--
-- ONBOARDING A NEW CUSTOMER'S INBOX (data side)
--   1. insert into public.tenants(owner,name) values ('acmecorp','Acme Corp');  -- if new
--   2. insert into public.tenant_inboxes(inbox_address, owner)
--        values ('rfq@acme.example', 'acmecorp') on conflict do nothing;
--   That is the ONLY data change needed to route their mail to their tenant. Wiring
--   their Gmail credential into the n8n trigger is a SEPARATE, manual step (a Gmail
--   OAuth credential per inbox), and is not represented in this table.
--
-- SECURITY
--   Service-role-only. RLS is ON with NO authenticated/anon policy, so the browser
--   (anon/authenticated) can never read the inbox↔tenant map; only the pipeline's
--   service_role key (which bypasses RLS) can. Grants are revoked from anon/authenticated
--   as defence in depth. This table is consumed by the pipeline, never by the console.

-- ── table ───────────────────────────────────────────────────────────────────────
create table if not exists public.tenant_inboxes (
  inbox_address text primary key,                       -- the RFQ mailbox (lower-case)
  owner         text not null references public.tenants(owner),
  created_at    timestamptz not null default now()
);

comment on table public.tenant_inboxes is
  'Dispatcher map: RFQ inbox address → tenant owner. Read by the n8n pipeline (service_role) to derive owner instead of hard-coding it. Service-role only; the console never reads this.';

create index if not exists tenant_inboxes_owner_idx on public.tenant_inboxes (owner);

-- ── seed Hassan (idempotent) ─────────────────────────────────────────────────────
-- tenants(owner) is created by quotewright-tenancy.sql; guard the FK in case this file
-- is somehow run first.
insert into public.tenants(owner, name)
  values ('hassannonwovens', 'Hassan Nonwovens')
  on conflict do nothing;

insert into public.tenant_inboxes(inbox_address, owner)
  values ('hassannonwovensrfq@gmail.com', 'hassannonwovens')
  on conflict do nothing;

-- ── RLS: service-role only (no authenticated/anon policy at all) ─────────────────
alter table public.tenant_inboxes enable row level security;
-- Deliberately NO policies: with RLS on and zero policies, anon + authenticated read
-- and write NOTHING; service_role bypasses RLS and works. Defence in depth: also revoke
-- the base grants so the failure is explicit, not silent.
revoke all on public.tenant_inboxes from anon, authenticated;

-- ── Verify (optional) ────────────────────────────────────────────────────────────
-- select inbox_address, owner from public.tenant_inboxes order by owner;
-- EXPECT: hassannonwovensrfq@gmail.com | hassannonwovens
