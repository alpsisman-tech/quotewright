# Quotewright Public-Site Design Spec (Phase 1)

The shared design foundation for the Quotewright **public marketing site**
(`index.html`, `product.html`, `contact.html`, `privacy.html`, `cookies.html`,
`terms.html`). Everything here already lives in `styles.css` and `app.js`.

**Phase-2 agents: build pages by composing the classes below. Do NOT edit
`styles.css` or `app.js`** unless a genuinely new primitive is unavoidable (if so,
add — never rename/remove — and document it here). Copy the `<head>`, nav and
footer markup verbatim so the chrome is identical on every page.

> ⚠️ `styles.css` is **shared with the off-limits console pages** (`dashboard.*`,
> `admin.*`, `insights.*`, `settings.*`, `customers.*`, `gaps.*`, `activity.*`,
> `onboarding.*`). The entire `:root` block is a **token contract** those pages
> read. Never rename or delete a token. The new public system is layered on top.

---

## 1. Aesthetic

Seam Studio DNA + Apple clarity: white canvas, ink text, a single electric-lime
accent, hairline borders, pill buttons, generous whitespace, big confident type,
restrained motion. **Near-black inset panels** (`.band` / `.cta-band`) supply punch
— used *sparingly*. Light theme only. Calm, precise, expensive — never hypey.

---

## 2. Colour tokens (from `:root`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#FFFFFF` | page background |
| `--ink` | `#131313` | primary text, primary button |
| `--soft` | `#6B6B6B` | body/secondary text (passes 4.5:1 on white) |
| `--grey` | `#9B9B9B` | captions, placeholders, de-emphasis |
| `--row` | `#F5F5F5` | subtle fills, input backgrounds |
| `--hair` | `#E7E7E7` | hairline borders |
| `--line-strong` | `#D6D6D6` | stronger dividers |
| `--lime` | `#D2FF37` | the ONE accent — dots, underlines, ticks, lime buttons |
| `--lime-border` `--lime-dim` `--lime-glow` `--lime-edge` | lime alphas | borders / glows / auras |
| `--panel` | `#111111` | footer / dark surfaces |
| `--on-ink` / `--on-ink-muted` / `--on-ink-line` | white + alphas | text/borders on dark bands |
| `--ok` `--ok-bg` / `--amber` `--amber-bg` | status | form success / "needs info" |

Accent discipline: lime is a **seasoning**, not a fill. One lime moment per
viewport is plenty (a dot, an underline, one button, one badge).

---

## 3. Type scale & fonts

Two families, loaded from Google Fonts (CSP-allowed):

- **Inter** (`--font`) — everything structural: UI, display, body, labels, numbers.
- **Newsreader** (`--doc`) — the **non-mono document/editorial serif**. This is the
  face for the **sample RFQ→quote**, email bodies, `<h_ em>` italic emphasis, and
  small editorial flourishes (language chips). **Never use `--mono` in public-page
  chrome or the sample quote.** `--mono` remains defined only for the console's use.

Fluid scale (all `clamp()`, display capped so the page never shouts):

| Token | Range | Applied to |
|---|---|---|
| `--fs-display` | 42→84px | reserved oversized display |
| `--fs-h1` | 33→66px | `h1` (small-screen cap ~29–38px) |
| `--fs-h2` | 30→46px | `h2` (small-screen cap ~27–40px) |
| `--fs-h3` | 23→28px | `h3` |
| `--fs-h4` | 20→23px | `h4`, card titles |
| `--fs-h5` | 17→19px | `h5`, step titles |
| `--fs-lead` | 17→19.5px | `.sub` / `.lead` |
| `--fs-body` | 15→16px | body |
| `--fs-small` | 14px | dense copy, meta |
| `--fs-caption` | 12→13px | captions |
| `--fs-eyebrow` | 11→12px | `.kicker` |

Tracking (size-specific): `--tr-display -.045em`, `--tr-h -.03em`,
`--tr-tight -.02em`, `--tr-eyebrow .14em`. Leading: `--lh-display 1.02`,
`--lh-tight 1.08`, `--lh-body 1.6`. `h1–h5` and `.woven` are pre-styled — just use
the tags. Emphasis inside headings: wrap a word in `<em>` → renders italic Newsreader.

Body cap ~60–65ch (`.sub`/`.lead` use `max-width` in ch). Headings use
`text-wrap:balance`; prose should use `text-wrap:pretty`.

---

## 4. Spacing, radii, elevation, motion

- **Spacing** (4px base): `--s1 4` `--s2 8` `--s3 12` `--s4 16` `--s5 24` `--s6 32`
  `--s7 48` `--s8 64` `--s9 96` `--s10 128`. Section rhythm: `--section`
  (76→128px, applied by `section{padding:var(--section) 0}`). Page gutter:
  `--gutter` (20→48px). `.sec-tight` = 60% section padding.
- **Radii**: `--r-xs 10` `--r-sm 14` `--r-md 18` `--r-lg 24` `--r-xl 30`
  `--r-pill 100px`.
- **Elevation** (soft, layered): `--e1` (rest) → `--e2` → `--e3` (card hover) →
  `--e4` (hero/mock windows). Legacy `--shadow-md/lg/hover` still valid.
- **Motion**: `--ease` (standard), `--expo` (critically-damped settle — reveals),
  `--spring` (pop/overshoot — press & pips). Durations `--d-fast .14s`,
  `--d-mid .28s`, `--d-slow .5s`, `--d-reveal .82s`. No bounce/elastic on entrances.
- **z-index scale**: `--z-sticky 100` `--z-menu 200` `--z-scrim 300`
  `--z-modal 400` `--z-toast 500`.

---

## 5. Shared `<head>` (paste verbatim on every public page)

```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PAGE TITLE — Quotewright</title>
<meta name="description" content="…">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%23131313'/><circle cx='15' cy='15' r='7' fill='none' stroke='%23D2FF37' stroke-width='2.6'/><path d='M18 18l4 4' stroke='%23D2FF37' stroke-width='2.6' stroke-linecap='round'/></svg>">
```

The favicon is a **neutral abstract "Q"** (ink tile + lime ring & tail). The old
"M" logo mark is gone — do not reintroduce any logo SVG anywhere.

---

## 6. Shared nav (paste verbatim; `id="nav"` / `id="navLinks"` power `app.js`)

Wordmark is **text only** — `.logo` renders "Quotewright" + a lime typographic dot
(via CSS `::after`, not a logo mark). Set `class="active"` on the current page's link.

```html
<div class="selvedge" aria-hidden="true"><span></span><span></span><span></span></div>

<nav id="nav">
  <div class="nav-inner">
    <a class="logo" href="index.html" aria-label="Quotewright home">Quotewright</a>
    <ul class="nav-links" id="navLinks">
      <li><a href="index.html">Home</a></li>
      <li><a href="product.html">Product</a></li>
      <li><a href="onboarding.html">Onboarding</a></li>
      <li><a href="contact.html">Contact</a></li>
      <li><a href="dashboard.html">Log in</a></li>
    </ul>
    <a href="contact.html" class="btn btn-primary btn-sm nav-cta">Book a pilot</a>
    <button class="menu-toggle" id="menuToggle" aria-label="Open menu" aria-expanded="false">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
  </div>
</nav>
```

Nav is translucent (`backdrop-filter` blur) and gains a hairline on scroll
(`app.js` toggles `.scrolled`). Mobile menu toggles `.open` on `#navLinks`.

---

## 7. Shared footer (paste verbatim; wordmark only, no logo mark)

```html
<footer>
  <div class="wrap">
    <div class="foot-inner">
      <div>
        <a class="logo" href="index.html" aria-label="Quotewright home">Quotewright</a>
        <p class="foot-desc">RFQ emails in, finished quotes out. Built on the floor of a working textile factory, for every made-to-order manufacturer drowning in requests for quotation.</p>
      </div>
      <div class="foot-links">
        <div>
          <h6>Product</h6>
          <ul>
            <li><a href="product.html">How it works</a></li>
            <li><a href="onboarding.html">Onboarding</a></li>
            <li><a href="product.html#integrity">Pricing integrity</a></li>
            <li><a href="product.html#features">Features</a></li>
          </ul>
        </div>
        <div>
          <h6>Company</h6>
          <ul>
            <li><a href="contact.html">Contact</a></li>
            <li><a href="contact.html">Book a pilot</a></li>
            <li><a href="privacy.html">Privacy</a></li>
            <li><a href="terms.html">Terms</a></li>
            <li><a href="cookies.html">Cookies</a></li>
            <li><a href="#" class="cookie-prefs">Cookie preferences</a></li>
          </ul>
        </div>
      </div>
    </div>
    <div class="foot-base">
      <span>© <span id="yr">2026</span> Quotewright. All rights reserved.</span>
      <span>Woven in İstanbul &amp; London</span>
    </div>
  </div>
</footer>

<script src="app.js"></script>
```

`app.js` stamps the year into `#yr` and wires the cookie banner (`.cookie-prefs`
re-opens it). Put `<script src="app.js"></script>` last, before `</body>`.

---

## 8. Component classes (compose these — don't invent new ones)

**Layout**
- `.wrap` — centered max-width (`--max` 1180px) with `--gutter` sides.
- `section` — vertical rhythm; `.sec-tight` for shorter. Wrap content in `.wrap`.
- `.sec-head` / `.sec-head.center` — heading block (add `.sub` under the `h2`).
- `.grid` + `.grid-2` / `.grid-3` / `.grid-auto` — quick responsive grids.
- `.center` — center-aligns headings/`.sub`.

**Buttons (pills)** — `.btn` + one of `.btn-primary` (ink), `.btn-light` (lime),
`.btn-ghost` (hairline). Sizes `.btn-sm` / `.btn-lg`. `.btn-block` = full width.
On dark bands use `.btn-ghost.on-dark`. Put an inline arrow `<svg>` inside for the
hover slide.

**Eyebrow** — `.kicker` (`.kicker.center`), Inter uppercase + lime tick. Use
**deliberately**, not above every section (avoid the AI-eyebrow reflex).

**Signature underline** — `<span class="woven">word</span>` inside an `h1`; the lime
brush wipes in when the `h1` gets `.in`.

**Cards** — `.cards` grid of `.card` (`.ic` icon tile, `h4`, `p`, optional `.fx`
fact chip). Lime top-bar + lift on hover. Don't nest cards.

**Numbered flow** — `.flow` (add `rv`, give it `id`) containing `.flow-thread` +
`.fstep`s (`.node` icon, `.fn` step label, `h4`, `p`). The lime thread grows when
the container gets `.in`. For product-page pipeline use the parallel `.pipeline` /
`.pstep` set.

**Dark inset bands** — `.band` (content in `.wrap`; `.band-grid` for split layouts;
`.fact-list`/`.fact` for the dark KPI list) and `.cta-band` (centered CTA). Use
sparingly.

**Guarantee** — `.bigquote` (with `<em>` for lime italic serif), `.guarantee-note`,
`.rules`/`.rule` (`.rn` label + `h5` + `p`) — designed to sit inside a `.band`.

**Console glimpse** — `.console-glimpse` split: `.cg-copy` (`.feature-list` /
`.fl-item` with `.tick`) + `.cg-window` mock (`.cg-top` `.qname`/`.qtab`, `.cg-list`
of `.cg-item` → `.cg-flag`/`.cg-meta`/`.cg-act`, `.cg-foot`).

**Languages** — `.lang-grid` of `.lang-chip` (`.lw` serif word, `.ln` gloss,
`.lproven` lime dot).

**Sample quote (product page — NON-MONO)** — `.qmail` document: `.qmail-band`
(`.brand`/`.meta`), `.qmail-body` (`.greet`, `.qtable` with `.prod`/`.spec`/`.sku`,
`.qbadge.priced|info|team`, `.qcash`/`.qterm`), `.qtotals` (`.cash`/`.term`/`.try`),
`.qneed`, `.qmail-foot`. All Inter/Newsreader + `tabular-nums`. There is also a
plain `.sample`/`.sample-body` (now Newsreader). **No `--mono` here.**

**Contact** — `.contact-grid` (copy + `form`), `.cpoints`/`.cpoint`,
`.next-steps`/`.nstep`. Form primitives: `<form id="pilotForm" …>` with `.field`
(label + input/select/textarea), `.form-foot`, `.form-status` (`.good`/`.bad`),
honeypot `.hp`. Keep Netlify attrs (`name="pilot" method="POST" data-netlify="true"
netlify-honeypot="bot-field"`, hidden `form-name`, honeypot field) — `app.js`
handles the AJAX submit. Do not put a real email in markup.

**Legal pages** — wrap the Termly prose in `.legal` > `.legal-body`; keep the shared
nav/footer and a `.page-hero` title. `.legal-body` styles `h2/h3/p/ul/ol/a`.

**Page hero (inner pages)** — `.page-hero` (`h1` + `.sub`).

---

## 9. Motion / reveal utilities

- Add `.rv` to anything that should fade+rise in; stagger siblings with
  `.rv-d1 … .rv-d6`. **Fail-safe**: content is visible by default and `app.js`
  force-adds `.in` (on load + a 1.4s safety timer), so reveals never hide content
  on JS failure or in headless renders. Respects `prefers-reduced-motion`.
- The loom demo, nav scroll state, mobile menu, FAQ, pricing toggle, plan→contact
  hand-off, Netlify AJAX, year stamp and cookie banner all live in `app.js` and key
  off the IDs/classes above. Keep those IDs intact.

---

## 10. Constraints checklist (every page must pass)

- Logo mark removed from nav, footer **and** favicon (wordmark text + lime dot only).
- No monospace in public chrome or the sample quote (`--doc` = Newsreader instead).
- Same `<head>`, nav, footer on every page; `styles.css` + `app.js` only.
- CSP: `script-src 'self'` — **all JS in `app.js`**, no external/CDN scripts, no
  inline `<script>`. Styles may be inline; fonts from googleapis/gstatic only;
  images `self`/`data:`.
- No horizontal overflow at 390px; verify with device emulation (headless Chrome
  enforces a 500px min window — use puppeteer `setViewport({width:390})`, not
  `--window-size`). 0 JS console errors.
- Contact form stays a working Netlify form (honeypot + AJAX); no email in code.
- Don't touch console/dashboard files or rename any `:root` token.
