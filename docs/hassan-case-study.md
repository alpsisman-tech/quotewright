# Case study — Hassan Tekstil: RFQ email to catalogue-accurate quote, automatically

> Reference deployment of **Quotewright**. Hassan Nonwovens / Hassan Tekstil A.Ş.
> (Esenyurt, İstanbul) is a nonwoven + microfiber manufacturer serving export
> customers across Europe. This is the live pipeline Quotewright grew out of.

*All quantitative claims marked `[FILL: …]` are placeholders with a measurement
method — fill them from real logs before publishing. Nothing is fabricated.*

---

## The problem

Hassan's export desk receives RFQs by email, in **many languages** (English,
German, Bulgarian, Turkish, French…), often as **multi-message threads** where
specs, quantities and even the accepted product change as the conversation goes.
Turning each one into an accurate quote meant a person:

- reading the whole thread and pinning down the final spec per line,
- finding each product in a **643-row** catalogue split across a nonwoven division
  (priced in EUR/m²) and a microfiber division (priced in USD, cash **and**
  term), plus per-customer contract prices,
- doing the unit maths (linear metres × roll width → m², box maths for
  microfiber), converting to a TRY reference at the day's rate,
- and writing a branded reply — without ever quoting a price the catalogue
  doesn't actually support.

It was accurate but slow, and it didn't scale with RFQ volume.

- Average manual turnaround per RFQ before automation: **[FILL: hours/quote — ask
  the export desk, or time 5–10 recent manual quotes end to end]**
- RFQs received per week: **[FILL: count from the RFQ Gmail label over 4 weeks ÷ 4]**

## The build

A draft-first pipeline on n8n Cloud + Supabase + the Anthropic API, with a human
as the send gate — **nothing goes out without sign-off.**

1. **Classify & label** — an inbound classifier tags real RFQs (and order
   acceptances) and ignores acks/newsletters/receipts.
2. **Read the thread** — the full multi-message thread is assembled (quoted reply
   text stripped, latest message marked), and the fields are extracted for the
   **single primary customer**, in the RFQ's own language.
3. **Match & price** — an agent searches the live catalogue per line, applies
   **per-customer contract pricing** when the customer is known, and covers every
   line as *priced*, *pending info*, or *route-to-sales*.
4. **Render** — a deterministic branded HTML email (EUR/USD aware, cash + term,
   with a code-computed TRY equivalent) plus a branded **PDF** attached via a
   WeasyPrint service.
5. **Draft & log** — the reply lands as a Gmail draft for a human to send, and the
   quote is logged to Supabase.

## How it works — the guarantees that make it trustworthy

- **It never invents a price.** Prices come only from the catalogue or a
  customer's contract price. A product with no trusted price is named and routed
  to the sales team — never estimated, never derived from cost.
- **Multilingual by default** — it replies in the language the customer wrote in.
- **Cash + term** — microfiber lines show both Peşin and Vadeli pricing; every
  quote carries both grand totals.
- **Thread-aware** — it reconciles conflicting specs to the latest instruction and
  prices an explicitly-accepted alternative instead of deferring it.
- **Order-confirmation mode** — when a customer accepts, it issues a final
  confirming quotation and promises a proforma, without inventing lead times.
- **Regression-tested** — a golden-case harness (`quotewright-eval`) locks the
  pricing rules in place; a prompt or catalogue change that breaks price
  integrity fails loudly.

## Results

- **Live in production** on Hassan's export inbox, drafting quotes end to end.
- **~49 quotes** logged to the pipeline to date.
- Validated to reproduce Hassan's **real quoted prices to the cent** (e.g. the
  microfibre pack lines), and to **refuse to invent** an uncatalogued surcharge even
  under direct instruction.
- Handles genuine production complexity: multi-email negotiations, multi-currency
  quotes, unit conversions, and per-customer contract pricing.

### Quantified impact — to be filled from logs

| Metric | Value | How to measure |
|---|---|---|
| Time to first-draft quote | `[FILL]` | Median time from RFQ arrival (Gmail received) to draft created (n8n execution finish). Pull from n8n execution timestamps. |
| Time saved per quote | `[FILL]` | (manual turnaround baseline above) − (human review time on a drafted quote). Time 5–10 reviews. |
| Quotes drafted per day | `[FILL]` | Count `quotes` rows per day over a representative fortnight (`owner='hassannonwovens'`). |
| % of RFQ lines auto-priced | `[FILL]` | Share of lines with status `priced` vs `pending_*` across logged quotes. Rises sharply once the list-price export lands (see data-request doc). |
| Pricing-error rate | `[FILL]` | Sample N drafted quotes, have the desk mark any line the human corrected before sending; report corrected-lines ÷ total lines. |
| Human-review/edit rate | `[FILL]` | Share of drafts sent unchanged vs edited. Track a flag on send. |

> Note: several impact metrics improve once the two SAP exports in
> `hassan-data-request.md` land — today ~692 of 707 products lack a general list
> price and fall back to the sales team, which caps the auto-priced percentage.

## What's next
- Load the **general list-price** export → auto-price the ~692 currently-manual
  products.
- Load the **email→customer-code** map → apply the ~1,143 contract prices with no
  back-and-forth.
- ERP/SAP integration so accepted quotes create sales orders and proformas
  directly.
