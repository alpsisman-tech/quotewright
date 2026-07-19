# Quotewright multi-tenancy (Wave A)

Turns Quotewright from a single-firm console into a real multi-tenant product with
**hard, database-enforced data isolation**. `quotewright-tenancy.sql` is the
authoritative security migration.

## The model

- **Tenant key** = the existing `owner` text column already on
  `quotes / customers / resolutions / catalog_gaps / digest / autonomy_settings`
  (Hassan = `hassannonwovens`).
- **`tenants`** — one row per tenant (`owner` PK + display name).
- **`account_profiles`** — maps each Supabase auth user → `owner` (tenant) + `role`
  (`member` | `admin`) + `status` (`pending` | `active` | `suspended`).
- **Access rules (enforced by RLS, not the frontend):**
  - A **member** sees only rows where `owner = auth_owner()` — their own tenant.
  - An **admin** sees/manages everything.
  - A **pending / suspended / unassigned** user sees **nothing** (`auth_owner()`
    returns `NULL`, which matches no row — fail-closed).
  - **Sensitive fields (owner / role / status) are admin-only.** Members have no
    update policy on `account_profiles`, so they can never self-assign a tenant or
    elevate to admin. User-editable onboarding lives in Supabase **auth
    user_metadata** (self-updatable, can't touch the sensitive fields).
- **`auth_owner()` / `auth_is_admin()`** are `SECURITY DEFINER` helpers with a pinned
  `search_path` that resolve the caller's tenant/admin flag from the *server-side*
  profile row (never from client input) without recursing through RLS.
- **New signups** get a PENDING profile automatically (the `on_auth_user_created`
  trigger). An admin then assigns their tenant via the admin page. **A new account is
  a clean slate — never Hassan's data.**
- **Pipeline unchanged:** n8n / webhooks keep writing with the `service_role` key,
  which bypasses RLS.

## Owner steps

1. **Run the SQL.** Supabase → SQL Editor (Hassan project `mtwgxwylufebaisawxvw`) →
   paste all of `quotewright-tenancy.sql` → Run. It is idempotent (safe to re-run).
   Then run the commented **`-- TESTS`** block at the bottom to prove isolation
   (a member sees only their tenant; a pending user sees zero; admin sees all; a
   member can't escalate; no legacy blanket policy survives).

2. **Enable email sign-ups.** Supabase → Authentication → Providers → **Email** →
   turn **Enable sign-ups ON**. (Required for self-serve signup. New users land
   PENDING until an admin activates them, so this is safe.)

`admin@seamai.com` is bootstrapped as owner `hassannonwovens` / admin / active by the
migration, so the existing Hassan console keeps working with zero interruption.
