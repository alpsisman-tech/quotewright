-- Quotewright — expansion migration: margin governance, explainability & follow-up.
-- Run ONCE in Supabase → SQL Editor for the Hassan project (mtwgxwylufebaisawxvw),
-- exactly like dashboard-rls.sql / quote-analytics.sql. Safe to re-run (idempotent).
--
-- Adds margin/approval/confidence/follow-up columns to public.quotes. The n8n
-- pipeline writes margin_pct / margin_amount / needs_approval / approval_reason /
-- match_confidence with the service_role key (bypasses RLS). Console users APPROVE
-- via the existing `quotes_authenticated_update` policy — no new policy needed
-- (that policy is `for update to authenticated using(true) with check(true)`, so it
-- already permits writing approved_by / approved_at / needs_approval from the app).
--
-- Per-line explainability (match_reason + confidence per line) lives INSIDE the
-- existing agent JSON in the `output` column (Quote Schema) — no column for it here.

alter table public.quotes
  add column if not exists margin_pct       numeric,          -- overall quote margin %, pipeline-computed (cost vs quoted)
  add column if not exists margin_amount    numeric,          -- absolute margin in the quote currency
  add column if not exists needs_approval   boolean not null default false,  -- margin below floor / discount above threshold
  add column if not exists approval_reason  text,             -- why it was flagged
  add column if not exists approved_by      text,             -- console user email who approved
  add column if not exists approved_at      timestamptz,      -- when approved
  add column if not exists match_confidence numeric,          -- overall 0–100 match/pricing confidence from the agent
  add column if not exists followup_count   int not null default 0,          -- follow-ups sent for this quote
  add column if not exists last_followup_at timestamptz;      -- last follow-up timestamp

-- Keep margin_pct sane (a %, not a ratio). Added separately so re-runs don't fail.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quotes_margin_pct_chk') then
    alter table public.quotes
      add constraint quotes_margin_pct_chk check (margin_pct is null or (margin_pct >= -100 and margin_pct <= 100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'quotes_match_conf_chk') then
    alter table public.quotes
      add constraint quotes_match_conf_chk check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 100));
  end if;
end $$;

-- The approval queue is read constantly; a partial index keeps it instant.
create index if not exists quotes_needs_approval_idx on public.quotes (needs_approval) where needs_approval;

-- ── RLS note (no change required) ────────────────────────────────────────────
-- Reads: quotes_authenticated_read (select to authenticated using true) already
--   exposes every column, including margin_pct, to signed-in staff. This is a
--   single-firm console (only Hassan staff get logins), so surfacing margin_pct
--   to those users is intended.
-- Writes: quotes_authenticated_update already permits the Approve action
--   (approved_by / approved_at / needs_approval) with no new grant. The anon key
--   without a session can still never write.
--
-- Verify the approve path with a signed-in session (should return the row):
--   update public.quotes
--     set needs_approval = false, approved_by = 'admin@seamai.com', approved_at = now()
--     where id = '<some-id>' returning id, needs_approval, approved_by, approved_at;
