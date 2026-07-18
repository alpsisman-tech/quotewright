-- Quotewright — quote outcome tracking + analytics (win / loss).
-- Run ONCE in Supabase → SQL Editor for the Hassan project (mtwgxwylufebaisawxvw),
-- exactly like dashboard-rls.sql. Safe to re-run (idempotent).
--
-- Adds a DEAL-OUTCOME lifecycle (pending → won / lost) on top of the existing
-- draft/sent send-state, plus an index and an UPDATE policy so signed-in console
-- users can record the outcome. The n8n pipeline writes with service_role and is
-- unaffected by RLS.

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

-- Signed-in console users may record an outcome. Single-firm console: all
-- authenticated users are trusted staff (same trust model as the read policy).
-- RLS `to authenticated` IS the server-side authorization — the anon/public key
-- alone can never write. The pipeline's service_role writes bypass RLS as before.
drop policy if exists quotes_authenticated_update on public.quotes;
create policy quotes_authenticated_update
  on public.quotes
  for update
  to authenticated
  using (true)
  with check (true);
