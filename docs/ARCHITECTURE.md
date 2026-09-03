# Architecture

Compacted from `AGENTS.md` sections Project, Layout, Stack.

## Project

Servicios Luxel manages Airbnb listings in Chile, end to end. The mission is the
host's time: the listing pays the host, and Luxel coordinates the people. A host
signs up, asks for the plan, and grants Luxel access to the listing in
Hospitable. There is one plan: 12% of the booking revenue, per listing, monthly.
Luxel runs the operation: dynamic pricing, guest replies (AI "Lux" plus Luxel
humans), cleaning, laundry, conflict resolution, inventory, small repairs,
furnishing. The app mirrors listings and reservations from Hospitable. It
renders the check-in page in the guest's language (es/en/pt); Hospitable's own
"New reservation" rule sends the guest the link. It notifies conserjes and the
cleaning crew over
WhatsApp. Hosts see their properties, calendar, revenue, and plan. Hosts never
see the crew or the guest messages.

## Layout

```
apps/web         @luxel/web              customer app → Vercel (serviciosluxel.cl)
apps/admin       @luxel/admin            operator panel → Vercel
workers/whatsapp @luxel/whatsapp-worker  Cloudflare Worker: WhatsApp webhook + /send
packages/shared  @luxel/shared           i18n catalogs, WhatsApp template kinds, constants
packages/config  @luxel/config           ESLint / TS / Tailwind presets
infra/cloudflare @luxel/infra-cloudflare Pulumi: DNS + Email Routing (R2 state)
infra/vercel     @luxel/infra-vercel     Pulumi: Vercel projects, CI-driven
supabase/        migrations + local config
```

## Stack

| Concern         | Tool                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| Hosting         | Vercel (one project per app root)                                             |
| Edge            | Cloudflare Workers, DNS, Email Routing                                        |
| Auth            | Clerk. Web `/admin` = Clerk `admin` role; `apps/admin` = Clerk org membership |
| Database        | Supabase Postgres + RLS                                                       |
| Channel (PMS)   | Hospitable, as a plugin behind `apps/web/src/lib/channels/registry.ts`        |
| Messaging       | WhatsApp Cloud API (worker), Resend email fallback                            |
| AI              | OpenAI `gpt-4o-mini` (`OPENAI_MODEL` override)                                |
| Dynamic pricing | PriceLabs (part of the plan)                                                  |
| Analytics       | In-house `analytics_events` + `leads`                                         |
