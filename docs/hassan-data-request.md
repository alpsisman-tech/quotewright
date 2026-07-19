# Data request — two exports that unlock richer auto-quoting

**To:** Hassan Tekstil (SAP / sales-data owner)
**From:** Quotewright (Hassan RFQ→Quote pipeline)
**Date:** 2026-07-19

The RFQ→quote pipeline is live and accurate today. Two data gaps are the *only*
thing forcing it to say "our sales team will follow up" instead of quoting a
number, and forcing it to ask the customer for a code it should already know.
Both are one-time SAP exports (refreshable on a schedule later). Neither exposes
cost data — we only need **sale/list prices** and a **customer identifier map**.

---

## Why this matters (plain version)

The agent **never invents a price** — that is the core promise. So whenever a
product has no sale price it can trust, or it can't be sure *which* customer is
asking, it correctly falls back to "sales team will follow up." That's safe, but
it means a human still has to price those lines by hand.

- **Gap 1 — list prices:** only **~15 of 707** priced products currently carry a
  general catalog list price; the other **~692** fall back to manual pricing.
  Give us a base list price per product and the pipeline can quote them
  instantly.
- **Gap 2 — customer identity:** RFQ emails carry a company name and an email
  domain, but **no SAP customer code**. We already hold ~1,143 agreed
  per-customer contract prices across 159 customers — but the agent can only
  apply them automatically if it can turn `someone@acme-textile.com` into the
  right SAP code without asking. Today it has to ask, which slows the reply.

---

## Data piece 1 — general list price per product

A base sale price for every sellable product, so uncataloged-price items stop
falling back to the sales team.

### Columns wanted (one row per SKU)

| Column | Meaning | Example |
|---|---|---|
| `sku` | Hassan material/SAP code (must match the `products` master key) | `OK0220SD1659H915` |
| `list_price` | General list / sale price (NOT cost) | `0.72` |
| `currency` | `EUR` for nonwoven/felt, `USD` for microfiber | `EUR` |
| `price_unit` | Basis of the price | `m2` (or `pack` / `box` / `kg`) |
| `valid_from` | Date the price takes effect | `2026-01-01` |
| `valid_to` | Expiry (blank = open-ended) | *(blank)* |

### Format
- **CSV or Excel, UTF-8.** One row per SKU. Header row exactly as above.
- Decimal point `.` (not comma) if possible; if SAP exports `0,72` we handle it,
  just tell us which.
- **Sale/list price only.** Do not include any cost, margin, or `maliyet` column —
  the agent must never see cost.

### How to export from SAP
- The material master sale price usually lives on a **condition record** (pricing
  condition type such as `PR00`) — transaction **VK13** (display condition) or a
  condition list via **V/LD**, or table **A304/KONP** for a condition-type +
  material extract.
- Alternatively, if list prices sit on the material master directly, **MM60**
  (material list) with the price field selected exports straight to Excel.
- If Hassan already maintains a price list per sales org / distribution channel,
  export that price list filtered to the sellable finished goods — that is
  exactly what we need.

---

## Data piece 2 — email/domain → customer SAP-code map

So the pipeline recognizes the sender and applies the right contract price
without asking.

### Columns wanted (one row per email or domain)

| Column | Meaning | Example |
|---|---|---|
| `customer_code` | SAP customer/debtor code (`KUNNR`) | `120045` |
| `customer_name` | Customer name (for the human-readable confirm) | `Homesentry BG` |
| `email_or_domain` | A full contact email **or** a bare domain that maps to this customer | `orders@homesentry.bg` **or** `homesentry.bg` |

- Multiple rows per customer are fine (several contacts / domains → same code).
- A **domain** row (`homesentry.bg`) covers every sender at that company; add
  specific full-email rows only for shared providers (gmail, hotmail) where the
  domain isn't unique to one customer.

### Format
- CSV/Excel, UTF-8, header row exactly as above.

### How to export from SAP
- Customer master: transaction **XD03/VD03** (display), or a mass export via
  **table KNA1** (`KUNNR` = code, `NAME1` = name) joined to **ADR6** / **KNVK**
  for email addresses (`SMTP_ADDR`).
- Simplest path: an SE16/quick-view export of **KNA1 + ADR6** giving
  `KUNNR, NAME1, SMTP_ADDR`, then we derive the domain from the email.
- If email isn't reliably in SAP, a manual spreadsheet mapping the top ~50–100
  active export customers (name + domain + code) covers the vast majority of RFQ
  volume and can grow over time.

---

## What we do with it
1. Load list prices → the ~692 currently-unpriced products start quoting
   automatically (still per catalog, still never invented).
2. Load the email→code map → inbound RFQs auto-resolve to the right customer, so
   the ~1,143 contract prices apply silently with no back-and-forth.

Both are additive and safe: they only add sale prices and an identifier map, and
never change the price-integrity rule (no price in the data ⇒ still "sales team
will follow up").

---

## Email draft — English (to whoever owns the SAP export)

> **Subject:** Two quick SAP exports to speed up automated quoting
>
> Hi [name],
>
> The automated quoting system is running well. Two small data exports would let
> it price a lot more RFQs instantly instead of routing them to the sales team.
>
> 1. **A product list-price export** — one row per product: SKU, list/sale price,
>    currency (EUR for nonwoven, USD for microfiber), unit (m²/pack/box),
>    valid-from date. Sale price only, no cost columns. (VK13 / MM60, or the
>    existing price list, exported to Excel.)
> 2. **A customer email→code map** — one row per customer: SAP customer code,
>    name, and the email domain(s) they write from. (KNA1 + ADR6, i.e.
>    KUNNR / NAME1 / SMTP_ADDR.)
>
> CSV or Excel is perfect. Full column details attached. Happy to hop on a quick
> call if the SAP export is easier to do together.
>
> Thanks,
> [Alp]

## Email draft — Türkçe (Ahmet için, kısa)

> **Konu:** SAP'tan iki kısa döküm — otomatik teklif için
>
> Baba,
>
> Otomatik teklif sistemi iyi çalışıyor. SAP'tan iki küçük döküm alabilirsek
> sistem çok daha fazla talebe elle uğraşmadan anında fiyat verebilir:
>
> 1. **Ürün liste fiyatı dökümü** — her ürün için: kod (SKU), satış/liste fiyatı,
>    para birimi (nonwoven'da EUR, mikrofiberde USD), birim (m²/paket/koli).
>    Sadece **satış fiyatı**, maliyet sütunu olmasın.
> 2. **Müşteri e-posta → kod eşlemesi** — her müşteri için: SAP müşteri kodu, adı
>    ve yazdıkları e-posta / alan adı (domain).
>
> Excel ya da CSV yeterli. Sütun detaylarını ekledim. İstersen birlikte
> bakabiliriz.
>
> Sevgiler,
> Alp
