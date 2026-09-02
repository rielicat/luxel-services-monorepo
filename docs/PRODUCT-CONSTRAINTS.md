# Product constraints

Compacted from `AGENTS.md` sections "Product constraints (user-set)" and
"Temporary: remove before public launch".

- Airbnb full management is the only service. No service picker, no
  cleaning-only offer, no "primary" badge.
- Marketing nav: `Servicio` (`/services/airbnb`) · `Precios` (`/calculator`) ·
  `Nosotros` (`/about`). One `Ingresar` button. No dropdown. No header CTA.
- Service icons share one color (`bg-primary/10 text-primary`).
- Three plans per listing per month (`apps/web/src/lib/plan-pricing.ts`): Fijo
  189.900 CLP; Mixto 49.900 CLP + 6% of booking revenue; Comisión 12% of booking revenue. Luxel bills monthly, off-platform. No free trial. No
  "recomendado" badge; the calculator marks the cheapest plan for the entered
  revenue.
- Hosts never see the crew or the guest messages. Those are Luxel operations.
- Copy never says "0% comisión", "14 días gratis", or "m²". Voice per
  [`BRAND.md`](BRAND.md).
- Competitor reference: `airhost.cl`, `airhostchile.com`. Our angle: full
  management, transparent plans (fixed fee or revenue share), monthly report.

## Temporary: stealth gate

In production the middleware rewrites every page to `app/[locale]/gate` until
the `luxel_gate` cookie exists. Typing `0612` unlocks it. To lift it, delete
`apps/web/src/app/[locale]/gate/` and the `withStealthGate` block in
`apps/web/src/middleware.ts`. Remove before public launch.
