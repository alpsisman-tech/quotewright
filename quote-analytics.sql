-- Quotewright — quote outcome tracking + analytics (win / loss).
-- Run ONCE in Supabase → SQL Editor for the Hassan project (mtwgxwylufebaisawxvw),
-- exactly like dashboard-rls.sql. Safe to re-run (idempotent).
--
-- Adds a DEAL-OUTCOME lifecycle (pending → won / lost) on top of the existing
-- draft/sent send-state, plus an index and an UPDATE policy so signed-in console
-- users can record the outcome. The n8n pipeline writes with service_role and is
-- unaffected by RLS.
--
-- ⚠️  RE-RUN SAFETY — READ BEFORE EDITING (cross-tenant leak hazard).
--   This file's UPDATE policy used to be a blanket `using (true) with check (true)`
--   named quotes_authenticated_update — a WRITE grant on every tenant's quotes. That
--   is correct ONLY on a pre-tenancy, single-firm database. quotewright-tenancy.sql
--   REPLACES it with the owner-scoped `quotes_tenant_update`. Postgres OR's permissive
--   policies together, so re-running the OLD version of this file AFTER tenancy would
--   put the blanket write back ALONGSIDE the tenant policy — the permissive one WINS
--   and every tenant could UPDATE every other tenant's quotes. The guarded DO block
--   below now ALWAYS drops the legacy blanket quotes_authenticated_update (self-healing
--   a re-opened DB) and installs a fallback UPDATE policy ONLY when tenancy's
--   quotes_tenant_update is absent, scoped to the owner — never a literal
--   `using (true)`. Net: safe to re-run in any order. Do NOT reintroduce an
--   unconditional blanket write policy here. (Guard pattern mirrors clients-page.sql.)

alter table public.quotes
  add column if not exists outcome text not null default 'pending',
  add column if not exists outcome_at timestamptz,
  add column if not exists outcome_note text;

-- constrain to the three valid states (added separately so re-runs don't fail)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quotes_outcome_chk') then
    alter table public.quotes
      add constraint quotes_outcome_chk check (outcome in ('pending','won','lost'));
  end if;
end $$;

create index if not exists quotes_outcome_idx on public.quotes (outcome);
create index if not exists quotes_created_idx on public.quotes (created_at);

-- Signed-in console users may record an outcome on their OWN firm's quotes. RLS
-- `to authenticated` + the owner scope IS the server-side authorization — the
-- anon/public key alone can never write. The pipeline's service_role writes bypass
-- RLS as before. (Single-firm fallback scopes to hassannonwovens; under multi-tenancy,
-- quotewright-tenancy.sql's quotes_tenant_update owns this and the block is skipped.)
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

  -- ALWAYS remove the legacy blanket UPDATE policy: a `using (true)` write must never
  -- coexist with an owner-scoped one (that coexistence IS the leak). No-op if absent.
  execute 'drop policy if exists quotes_authenticated_update on public.quotes';

  -- Install the fallback ONLY when tenancy has not already scoped quotes' UPDATE.
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'quotes'
                   and policyname = 'quotes_tenant_update') then
    execute 'drop policy if exists quotes_owner_update on public.quotes';
    execute 'create policy quotes_owner_update on public.quotes
               for update to authenticated using ' || scope || ' with check ' || scope;
  end if;
end $$;
