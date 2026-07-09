-- Quote console access control.
-- Run this ONCE in Supabase → SQL Editor for the Hassan project (mtwgxwylufebaisawxvw).
--
-- What it does: turns on Row Level Security for `quotes` and allows ONLY signed-in
-- users to read them. Anonymous visitors (anon key, not logged in) get nothing.
-- The n8n pipeline writes with the service_role key, which bypasses RLS, so quote
-- logging keeps working untouched.

alter table public.quotes enable row level security;

-- Signed-in users may READ all quotes. (Single-firm console; only Hassan staff get logins.)
drop policy if exists quotes_authenticated_read on public.quotes;
create policy quotes_authenticated_read
  on public.quotes
  for select
  to authenticated
  using (true);

-- No insert/update/delete policies for authenticated => the dashboard is READ-ONLY.
-- (The pipeline's service_role writes are unaffected by RLS.)

-- ── Create a login for the console ────────────────────────────────────────────
-- Supabase → Authentication → Users → "Add user" → set an email + password.
-- Optional: Authentication → Providers → Email → turn OFF "Enable sign-ups" so only
-- users you add by hand can ever exist.
