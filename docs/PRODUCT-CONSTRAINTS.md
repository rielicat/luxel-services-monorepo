# Product constraints

Compacted from `AGENTS.md` sections "Product constraints (user-set)" and
"Launch".

- Airbnb full management is the only service. No service picker, no
  cleaning-only offer, no "primary" badge.
- Marketing nav: `Servicio` (`/#servicio`) · `Precios` (`/calculator`) ·
  `Nosotros` (`/about`). `Servicio` anchors to the home page; there is no separate
  service page. One `Ingresar` button. No dropdown. No header CTA.
- Service icons share one color (`bg-primary/10 text-primary`).
- One plan only (`packages/shared/src/plan-pricing.ts`): 12% of the booking
  revenue, IVA included, per listing per month. Luxel bills monthly,
  off-platform. There is no fixed fee and no other plan. Do not add a second
  plan, a plan picker, or a "recomendado" badge. No free trial. The calculator
  turns a monthly revenue into the fee; it compares nothing.
- The commission base is the booking only. The guest cleaning fee is 100% for
  the cleaning crew, and Luxel charges no commission on it. The sync mirrors
  it as `reservation_revenue.cleaning_fee_clp`, and `commissionBaseClp` in
  `packages/core/src/revenue.ts` is the host payout minus that fee. Luxel pays
  the crew against a document — a contract or a boleta de honorarios — so the
  fee is a documented pass-through and not undeclared Luxel revenue.
- **Not true yet.** Airbnb co-host payout splitting is not configured on any
  listing. Airbnb pays the host and Luxel invoices monthly, off-platform. No
  copy may say that Airbnb pays Luxel, deducts our fee, or splits the payout.
  An operator must set the split up first, then this line changes.
- Hosts never see the crew or the guest messages. Those are Luxel operations.
- **The website never sends anyone to WhatsApp.** No page a host or a visitor
  reads offers a `wa.me` link, a "message us on WhatsApp" button or WhatsApp as
  a way to reach us. That covers the landing page, the chat widget's human
  handoff and the connect panel. A human handoff continues in the chat it started in.
  That mode is server state, never a browser flag. `GET /api/chat/human` answers it
  from the session's `handoff` message, and the widget asks on every open. It expires
  `CHAT_HANDOFF_TTL_HOURS` after the last message of the session, so a later visit
  starts with Lux again. WhatsApp stays what it already is. Luxel uses it outbound to reach
  conserjes, the cleaning crew and a host an operator is chasing. It also
  carries the crew's own `/cleaning/confirm/[token]` link. It is an operations channel, never a
  published front door.
- Copy never says "0% comisión", "tarifa plana", "14 días gratis", "prueba
  gratis", or "m²". Voice per [`BRAND.md`](BRAND.md).
- **Copy never names a city.** No city appears in anything a person reads: page
  copy, i18n catalogs, alt text, metadata, emails, or WhatsApp templates.
  "Chile" is allowed. A comuna is allowed only as real data about a real unit;
  for an example or a placeholder prefer Providencia, Las Condes, or Ñuñoa. This
  rule covers copy only. Keep the timezone string `America/Santiago`, the
  identifiers that carry it (`santiagoToday`, `santiagoMonth`, `todaySantiago`),
  and the address fixtures and seeds exactly as they are.
- Luxel writes as a **partner, not a vendor**. Copy stands on the host's side of
  the table: "nosotros nos encargamos", never "el cliente debe".
- Competitor reference: `airhost.cl`, `airhostchile.com`. Our angle: full
  management, one transparent fee on the booking revenue, monthly report.

## Launch

The site is public. The stealth gate is gone: no `luxel_gate` cookie, no gate
page, no rewrite in `apps/web/src/middleware.ts`. Do not add one back.
`robots.ts` and `sitemap.ts` live in `apps/web/src/app`. `/checkin/[id]` and
`/cleaning/confirm/[token]` stay `noindex`, because their URL is their only
credential. `POST /api/events` is unauthenticated on purpose and rate limited
per caller; never remove that limit.
