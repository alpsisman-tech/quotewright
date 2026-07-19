# Quotewright Intelligence Schema

The DATA + LEARNING foundation for the Quotewright copilot. Apply
`quotewright-intelligence.sql` ONCE in Supabase → SQL Editor for the Hassan
project (`mtwgxwylufebaisawxvw`). It is idempotent and additive — safe to re-run,
wipes nothing. Until it is applied, the Learning & Digest workflow and the copilot
webhooks will error on the missing tables.

All new tables have **RLS ON**. `authenticated` may `SELECT` every table;
`autonomy_settings` also allows `authenticated UPDATE` (the dashboard edits the
gates). Everything else is written by the n8n pipeline / webhooks with the
`service_role` key, which bypasses RLS. The anon key can never read or write.

---

## Tables

### `customers` — customer memory
One row per recurring customer. The pipeline upserts on `(owner, lower(email))`
every quote: increments `quote_count` (and `order_count` on confirmed orders),
appends the last N products to `history`, and learns `currency_pref` /
`preferences` (colour, edge, units).

| column | type | notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `owner` | text | firm key, e.g. `hassannonwovens` |
| `email` / `domain` / `name` / `sap_code` | text | identity |
| `quote_count` / `order_count` | int | counters |
| `first_seen` / `last_seen` | timestamptz | |
| `currency_pref` | text | learned EUR/USD/… |
| `preferences` | jsonb | learned prefs `{}` |
| `history` | jsonb | last N products `[]` |
| `notes` | text | |

Unique: `(owner, lower(email))` where email not null.

### `resolutions` — learning: human product picks/edits
Every time a human resolves a flagged line (dashboard pick, edited reply), insert
a row keyed by `request_signature`. Before flagging a line, the pipeline reads the
**latest** resolution for `(owner, request_signature)` — an exact signature hit
auto-resolves (price that SKU) with note "matched from a previous resolution".

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `owner` | text | |
| `request_signature` | text | canonical key (below) |
| `chosen_sku` | text | the SKU the human picked |
| `chosen_by` | text | console user email |
| `quote_id` / `source` | text | provenance |
| `created_at` | timestamptz | |

Index: `(owner, request_signature, created_at desc)`.

### `catalog_gaps` — learning: requested-but-missing
Every `pending_info` / `pending_hassan` line upserts on `(owner, request_signature)`
and increments `count`. Feeds the dashboard "gaps" view and the Hassan list-price
ask. `status` ∈ `open` | `resolved` | `ignored`.

Unique: `(owner, request_signature)`.

### `autonomy_settings` — per-owner gates (single row)
`owner` pk; `auto_send_enabled` (default **false** — auto-send is opt-in),
`green_min_confidence` (90), `green_min_margin` (20), `amber_min_confidence` (60),
`updated_at`. The SQL seeds one row for `owner='hassannonwovens'`. The dashboard
edits it (`authenticated UPDATE`). The pipeline computes a quote's `autonomy_tier`
(green/amber/red) from confidence + margin against these thresholds.

### `digest` — daily rollup the dashboard reads
Written by the **Quotewright Learning & Digest (NEW)** workflow. One row per
`(owner, digest_date)`; the rollup upserts today's row, the dashboard reads the
latest by `generated_at`. Fields: `open_needs_info`, `needs_approval`,
`recent_replies`, `customers_total`, `gaps_open`, `top_gaps` (jsonb array),
`summary` (jsonb).

### `quotes` — added columns
`gmail_thread_id`, `gmail_draft_id`, `autonomy_tier` (green/amber/red),
`sent_at`, `sent_by`, `last_reply_text`, `thread_snapshot` (jsonb messages array
so the dashboard renders the thread without a live Gmail call).

---

## Canonical `request_signature` normalization rule

`request_signature` is the join key that makes learning work. The pipeline, the
webhooks, and any rollup MUST compute it **identically**, or a repeat request will
not match a prior resolution / gap. This is the single source of truth.

### Definition

A signature is built from **five components in fixed order**:

```
producttype | gsm | size | colour | edge
```

1. Normalize each component with the rules below.
2. **Drop** any component that is empty/null/missing after normalization.
3. Join the surviving components with a single pipe `|` (no spaces around it).

The result is always **lower case**, ASCII-folded, and whitespace-free.

### Per-component normalization

Base normalizer `norm(v)` applied to producttype, colour, edge:

1. `String(v)` (null/undefined → `''`).
2. `.toLowerCase()`.
3. Unicode `NFKD`, then strip combining marks (`/[̀-ͯ]/g`) — folds
   accents (ç→c, ö→o, ü→u, ş→s, ğ→g, İ→i, …).
4. Map Turkish dotless i: `ı → i` (it carries no combining mark).
5. Replace every run of non-`[a-z0-9]` with a single space; trim.
6. Remove ALL remaining spaces (`/\s+/g → ''`) — the token is whitespace-free.

Field-specific pre-steps:

- **producttype** → `norm(producttype)`.
- **gsm** → digits only: `String(gsm).replace(/[^0-9]/g,'')` (e.g. `"220 gsm"` → `"220"`). Drop if empty.
- **size** → `norm(size)`, then collapse the separator to `x` and drop unit words:
  `.replace(/\b(mm|cm|m)\b/g,'')` **before** the space-strip so `"165 cm x 100 cm"` → `"165x100"`. In practice: normalize, turn `× * by` and spaced-x into a single `x`, keep digits + `x`.
- **colour** → `norm(colour)` (e.g. `"Siyah"` → `"siyah"`, `"SİYAH"` → `"siyah"`).
- **edge** → `norm(edge)`.

### Reference implementation (JS — use verbatim in n8n Code nodes & webhooks)

```js
function norm(v) {
  if (v === null || v === undefined) return '';
  let s = String(v).toLowerCase();
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, ''); // strip accents
  s = s.replace(/ı/g, 'i');                                // Turkish dotless i
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();                // non-alnum -> space
  return s.replace(/\s+/g, '');                            // whitespace-free
}

function normGsm(v) {
  return String(v ?? '').replace(/[^0-9]/g, '');
}

function normSize(v) {
  if (v === null || v === undefined) return '';
  let s = String(v).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/ı/g, 'i');
  s = s.replace(/[×*]/g, 'x').replace(/\bby\b/g, 'x'); // unify separators
  s = s.replace(/\b(mm|cm|m)\b/g, '');                 // drop unit words
  s = s.replace(/[^a-z0-9x]+/g, ' ').trim();
  s = s.replace(/\s*x\s*/g, 'x');                      // tighten around x
  return s.replace(/\s+/g, '');
}

// spec = { producttype, gsm, size, colour, edge }
function requestSignature(spec) {
  const parts = [
    norm(spec.producttype),
    normGsm(spec.gsm),
    normSize(spec.size),
    norm(spec.colour),
    norm(spec.edge),
  ];
  return parts.filter(Boolean).join('|');
}
```

### Examples

| input | signature |
|---|---|
| HASKECE K, 220 gsm, 165×100 cm, SİYAH, — | `haskecek\|220\|165x100\|siyah` |
| Spunlace, —, —, White, cut edge | `spunlace\|white\|cutedge` |
| microfiber, 300, 40cm x 40cm, blue, overlock | `microfiber\|300\|40x40\|blue\|overlock` |

Empty components are dropped, so a request giving only producttype + colour still
produces a stable, matchable key.
