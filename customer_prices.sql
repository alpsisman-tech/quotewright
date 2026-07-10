-- Quotewright — per-customer contract pricing.
-- Run ONCE in Supabase → SQL Editor (Hassan project mtwgxwylufebaisawxvw).
--
-- This is ADDITIVE and non-destructive: the existing `products` catalog (general
-- selling prices) is untouched and remains the fallback. This table holds each
-- customer's own agreed price, which OVERRIDES the list price when it exists.
--
-- Pricing priority the agent will use:
--   1. this customer's in-validity price for the SKU   (customer_prices)
--   2. else the general catalog price                  (products.satis_eur / satis_usd)
--   3. else "sales team will follow up"                (never invent a number)

create table if not exists public.customer_prices (
  id            bigint generated always as identity primary key,
  customer_code text not null,          -- SAP customer number, e.g. 101804
  customer_name text,                   -- e.g. "KPD LTD."
  sku           text not null,          -- Hassan code (nonwoven e.g. KR0180BD100N057, or microfiber numeric)
  sku_type      text,                   -- 'nonwoven' | 'microfiber'
  unit          text,                   -- ÖB: M2 / KG / M / ADT / PAK / KL
  price         numeric,                -- amount in `currency`, per `unit`
  currency      text,                   -- EUR / USD / TRY
  valid_from    date,
  valid_to      date,
  sap_material  text,                   -- SAP material number (col A of the source)
  short_text    text,                   -- SAP material short text (for reference / disambiguation)
  loaded_at     timestamptz default now()
);

create index if not exists customer_prices_sku_idx      on public.customer_prices (sku);
create index if not exists customer_prices_cust_idx      on public.customer_prices (customer_code);
create index if not exists customer_prices_custname_idx  on public.customer_prices (lower(customer_name));

-- RLS: service-role only (the n8n pipeline uses the service key, which bypasses RLS).
-- No anon/authenticated policies => the public anon key cannot read this table.
alter table public.customer_prices enable row level security;

-- After running this, import hassan_customer_prices_load.csv via
-- Supabase → Table Editor → customer_prices → Insert → Import data from CSV.
