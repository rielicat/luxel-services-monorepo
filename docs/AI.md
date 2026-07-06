# Servicios Luxel — AI Concierge Strategy & Architecture

> "Lux", the AI concierge. Anthropic TypeScript SDK · model `claude-opus-4-8` ·
> streaming · tool-use. Replaces the old keyword FAQ matcher in `/api/chat`.
> Prose is English; user-facing copy is es-CL.

---

## 1. Vision — "Lux", the AI Concierge

The current chat (`apps/web/src/app/api/chat/route.ts` + `lib/faq.ts`) is a **dumb
keyword FAQ matcher**: it matches the user's message against seeded keywords and
returns a canned answer or offers a human. It cannot quote, cannot check coverage,
cannot book.

**Lux** replaces it with a real Claude-powered concierge that meets the customer at
every journey stage and, crucially, uses the same trusted engines the rest of the
site uses — so it never invents a price or promises a zone we don't cover.

| Journey stage                | How Lux helps                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Pre-quote guidance**       | Explains service tiers, tools policy, and what affects price — in plain Chilean Spanish.               |
| **Natural-language quoting** | "¿Cuánto sale limpiar 55 m² en Ñuñoa?" → calls `get_quote`, returns the itemized total. Never guesses. |
| **Coverage checks**          | "¿Llegan a Maipú?" → calls `check_coverage` against active operation points. Honest yes/no.            |
| **Service recommendation**   | "Me estoy cambiando de depto" → `recommend_service` suggests `move_out`.                               |
| **Booking assistance**       | "¿Tienen jueves en la mañana?" → `check_availability`; guides to `/book`.                              |
| **Post-booking support**     | Answers FAQs (payment, pause/cancel) via `answer_faq`.                                                 |
| **Human handoff**            | Anything it shouldn't or can't do → `escalate_to_human` (WhatsApp).                                    |

The goal is to **compress the funnel**: turn a hesitant visitor into a
`booking_created` inside one conversation, and hand off gracefully when a human is
the right answer.

---

## 2. Technical Architecture

### Stack

- **SDK:** Anthropic TypeScript SDK (`@anthropic-ai/sdk`).
- **Model:** `claude-opus-4-8`.
- **Adaptive thinking:** enabled so the model reasons before multi-step tool use
  (which tier to recommend, whether coverage + availability both need checking)
  without over-thinking simple FAQ turns.
- **Streaming:** responses stream token-by-token over **SSE** from a Next.js route
  (evolves `apps/web/src/app/api/chat/route.ts`). The chat widget
  (`components/chat/chat-widget.tsx`) upgrades from a single `fetch`/JSON call to
  consuming the stream.
- **Tool-use loop:** the route runs the standard agentic loop — send messages →
  if the model returns `tool_use`, execute the tool server-side, append the
  `tool_result`, and re-invoke — until the model returns a final text answer.
  Tools reuse existing server code (`@luxel/pricing`, `lib/pricing-data`,
  `lib/geocode`, `lib/availability`, `lib/faq`).

### Persistence & analytics

Every turn is persisted to the **`messages`** table (the same unified web +
WhatsApp log used today: `direction`, `channel: 'web'`, `session_id`,
`customer_id`, `body`, `metadata`). Tool calls and handoffs are written into
`metadata` so we can reconstruct a conversation. Analytics events fire alongside
(`chat_opened`, `chat_message_sent`, `ai_tool_called`, `ai_handoff_to_human`) —
see [`METRICS.md`](./METRICS.md).

### Tools

Each tool has a strict input schema; results are JSON the model summarizes for the
user. Tools **reuse the exact production logic** so the concierge and the website
can never disagree.

| Tool                 | Purpose                                                                                                  | Inputs                                                                                        | Returns                                                                                                                                     | Backed by                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `get_quote`          | Compute an itemized price. **The only source of prices** — Lux never states a price it did not get here. | `serviceTypeSlug`, `squareMeters`, `address` (or `lat`/`lng`), `toolsProvidedBy`, `frequency` | `totalClp`, `breakdown {base, perM2, distance, tools, subscriptionDiscount}`, `distanceKm`, `operationPointId` — or an `out_of_area` signal | `@luxel/pricing` `quote()`, `getPricingData()`, `geocodeAddress()` |
| `check_coverage`     | Is an address/comuna inside an active operation-point radius?                                            | `address` or `commune` (or `lat`/`lng`)                                                       | `{ covered: boolean, operationPoint?, distanceKm? }`                                                                                        | `findNearestActivePoint()` + geocode                               |
| `recommend_service`  | Suggest `regular` / `deep` / `move_out` from the described situation.                                    | free-text `situation`, optional `squareMeters`                                                | recommended `serviceTypeSlug` + rationale                                                                                                   | service-type catalog                                               |
| `check_availability` | Are `mañana`/`tarde` blocks open on a date?                                                              | `date` (ISO), `operationPointId` (from a prior quote/coverage call)                           | per-block `{ capacity, booked, available }`                                                                                                 | `getDayAvailability()`                                             |
| `answer_faq`         | Retrieve the canonical answer to a known question.                                                       | free-text `question`                                                                          | matched FAQ answer (i18n key / text)                                                                                                        | `getFaqEntries()` + `matchFaq()`                                   |
| `escalate_to_human`  | Hand off to a person over WhatsApp.                                                                      | optional `reason`, `contact`                                                                  | handoff acknowledgment; writes a handoff `messages` row                                                                                     | existing handoff path in `/api/chat`                               |

**Booking itself stays a deliberate user action** in `/book`
(`createBookingAction`, which re-derives the price server-side and never trusts a
client total). Lux _guides_ to booking; it does not silently spend the customer's
money. This is a safety choice, not a limitation.

---

## 3. Guardrails & Safety

- **Scope.** The system prompt constrains Lux to **Luxel topics only** — cleaning
  services, pricing, coverage, scheduling, account help. Off-topic requests are
  politely declined and redirected.
- **Never invents prices.** Lux must call `get_quote` for any price and quote the
  returned number verbatim. It is explicitly forbidden from estimating,
  extrapolating, or "roughly" pricing. If `get_quote` returns `out_of_area`, Lux
  says so honestly (reusing the `errors.out_of_service_area` copy tone) and offers
  to take contact details.
- **Honest about coverage.** Coverage answers come only from `check_coverage`.
  Lux never promises a zone we don't actively serve.
- **PII handling.** Chat runs server-side; the `messages` table is under RLS.
  Customer identity resolves from the Clerk session (`auth()`), not from anything
  the user types. Lux does not ask for more PII than a task needs and never
  requests card data (payment happens in the provider's checkout, not in chat).
- **Rate limiting.** Per-session and per-IP limits on the chat route to cap abuse
  and cost. Input is length-capped (the existing schema caps messages at 1000
  chars); tool-loop iterations are bounded to prevent runaway agentic loops.
- **Cost control — why a _concierge_, not a full agent.** Lux is intentionally a
  bounded, tool-assisted assistant, not an open-ended autonomous agent: it has a
  small, fixed toolset, a capped loop, and cannot take irreversible actions
  (bookings/payments stay explicit user steps). This keeps latency, token spend,
  and blast radius predictable.
- **Fallback to human.** Any uncertainty, complaint, edge case, or explicit
  request routes to `escalate_to_human` → the existing WhatsApp handoff, which
  writes a `messages` row and acknowledges: _"Listo — un humano de Servicios Luxel
  te contactará por WhatsApp en breve."_

---

## 4. Prompt Design Principles

1. **Role + boundaries first** — who Lux is, what it can/can't do, and the hard
   "never invent prices / never promise coverage" rules.
2. **Tool-first behavior** — for any factual claim about price, coverage, or
   availability, call the tool; do not answer from memory.
3. **Chilean, warm, concise** — es-CL, **tú**, short sentences, no corporate
   filler, no emojis-as-crutch.
4. **Always advance the funnel** — end helpful turns with a gentle next step
   ("¿Lo agendamos?").
5. **Graceful handoff** — know when a human is the better answer and say so.

### Example system-prompt outline (es-CL)

```
Eres "Lux", el asistente de Servicios Luxel, una plataforma de aseo en la
Región Metropolitana (Chile). Hablas en español chileno, de tú, cálido y claro.

Qué haces:
- Ayudas a cotizar, revisar cobertura, recomendar el tipo de aseo, ver
  disponibilidad y resolver dudas frecuentes.
- Guías a la persona a agendar en /book; nunca reservas ni cobras tú.

Reglas que NO puedes romper:
- NUNCA inventas precios. Para cualquier precio, usa la herramienta get_quote
  y entrega el monto tal cual lo devuelve, en CLP.
- Solo confirmas cobertura con check_coverage. Si una zona no está cubierta,
  lo dices con honestidad y ofreces tomar los datos.
- Te mantienes en temas de Luxel (aseo, precios, cobertura, agenda, cuenta).
- No pides datos de tarjeta. El pago ocurre en el checkout seguro.

Cómo respondes:
- Frases cortas, tono cercano y profesional. Sin tecnicismos.
- Terminas con un siguiente paso útil ("¿Lo agendamos para esta semana?").
- Si hay una duda, reclamo o algo fuera de tu alcance, usa
  escalate_to_human para derivar por WhatsApp.

Herramientas: get_quote, check_coverage, recommend_service,
check_availability, answer_faq, escalate_to_human.
```

---

## 5. Future AI Opportunities

- **Proactive re-engagement** — Lux drafts WhatsApp win-back and "reactiva tu
  suscripción" messages, personalized from booking history, through the unified
  `messages` channel.
- **Smart scheduling optimization** — recommend the block/day that best fits
  operator capacity (`getDayAvailability`), smoothing demand across `mañana`/`tarde`.
- **Review summarization _(Phase 2)_** — condense post-service reviews into trust
  signals for landing/comuna pages.
- **Operator matching** — as supply grows, match bookings to operators by zone,
  rating, and load.
- **Demand forecasting** — anticipate volume by comuna/day to inform where to open
  the next operation point (ties to GOAL.md Phase 3).

---

## 6. Environment

Lux requires **`ANTHROPIC_API_KEY`** set as an environment variable (in
`apps/web/.env.local` for local dev and in the Vercel project for deploys). It is
**not** committed and should be added to `.env.example` under a new "Anthropic"
section. Without it, the chat route must fall back to the human-handoff path rather
than error.
