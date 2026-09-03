# Servicios Luxel — AI Concierge & Guest-Reply Pipeline

> "Lux", the AI concierge, and the guest auto-replies. OpenAI Node SDK
> (`openai`) · model `gpt-4o-mini` (`OPENAI_MODEL` override) · SSE streaming ·
> tool-use. Prose is English; user-facing copy is es-CL.

---

## 1. Two AI surfaces

The AI does two jobs. Both use the same client
(`apps/web/src/lib/ai/client.ts`).

Lux carries the Luxel positioning. Luxel gives the host the time back. An
Airbnb must be income that the host receives, not people that the host
coordinates. Lux writes as a partner of the host, never as a distant supplier.

| Surface                     | Where                                                             | What it does                                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lux**, the site concierge | Chat widget → `POST /api/chat`                                    | Speaks for the partner that carries the work. Sells and supports Airbnb management. Quotes the fee with `get_airbnb_quote`. Shows a signed-in host real account data. Hands off to a human on WhatsApp. |
| Guest auto-replies          | Hospitable `message.created` webhook → `lib/channels/pipeline.ts` | Answers a guest in the Airbnb thread from the property's own data. Flags the thread for a Luxel human when it cannot answer.                                                                            |

### Lux by journey stage

| Journey stage                 | How Lux helps                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host pre-sale                 | "¿Cuánto cuesta que administren mi depto?" → `get_airbnb_quote`. The fee is one number: 12% of the booking revenue. The answer leads with what the host keeps, then the Luxel fee. |
| "What do I charge per night?" | → `get_pricing_reference`. With no market data wired up it returns no numbers. Lux then offers a pricing proposal. It never states a rate of its own.                              |
| Host support                  | A signed-in host asks about occupancy, upcoming stays or revenue → `get_host_status`.                                                                                              |
| Navigation                    | `share_links` renders 1–3 buttons to real routes. The model never writes a URL.                                                                                                    |
| Human handoff                 | Anything it cannot or must not do → `escalate_to_human` (WhatsApp).                                                                                                                |

Lux compresses the funnel. It turns a visitor into a plan request inside one
conversation. It hands off when a human is the right answer.

### Example flow — the visitor does not know the revenue

The visitor asks the price, then says "no sé cuánto cobrar por noche".

1. Lux asks for the monthly revenue **once**.
2. The visitor cannot give it. Lux does not ask again and does not repeat the
   question in other words.
3. Lux calls `get_pricing_reference` with what the visitor already gave: the
   comuna or address, the bedrooms, the size, the capacity.
4. The tool returns no numbers today. Lux answers in this shape: it reflects the
   property back in the visitor's own words; it says that the nightly rate is
   part of the service; it explains that Luxel prices with PriceLabs by demand,
   season and weekday; it offers a pricing proposal for that property and asks
   only for the one input it still needs.
5. Lux never says "revisa la competencia". That is the work the visitor is
   buying.

### Example flow — the visitor gives a revenue range

The visitor says "entre 900.000 y 1.100.000". Lux calls `get_airbnb_quote`
**once** with the range. One answer carries one quote widget, never two
scenarios. The sentence order is what the host keeps first, the Luxel fee
second. Lux adds that the guest cleaning fee goes whole to the crew and pays no
commission.

---

## 2. Lux — technical architecture

### Stack

- **SDK:** OpenAI Node SDK (`openai`), Chat Completions with function tools.
- **Model:** `AI_MODEL` = `OPENAI_MODEL` or `gpt-4o-mini` (`lib/ai/client.ts`).
- **Streaming:** the route streams **SSE** events (`text`, `tool`, `widget`,
  `done`, `error`) from `apps/web/src/app/api/chat/route.ts`. The widget
  (`components/chat/chat-widget.tsx`) consumes the stream.
- **Tool loop:** up to `MAX_TOOL_ROUNDS = 6`. Each round streams one completion.
  When it ends with `tool_calls`, the route runs each tool server-side
  (`runTool`), appends the `tool` messages, and calls again. When the rounds run
  out, one final call without tools produces the closing answer.
- **Prompt caching:** system prompt + tools form a stable prefix. OpenAI caches
  those input tokens across turns.
- **Limits:** the body schema allows 40 messages of up to 4000 chars each.
  `max_completion_tokens` is 1024. `maxDuration` is 60 s.
- **Without a key:** `getOpenAI()` returns null. The route streams a fixed
  fallback reply that points to the calculator and WhatsApp. It records the turn
  as `ai_unavailable`.

### Persistence & analytics

Every turn is written to the `messages` table (`channel: 'web'`, `direction`,
`session_id`, `customer_id`, `body`, `metadata.kind` ∈
`ai | handoff | ai_unavailable`). The route emits `chat_message_sent`,
`ai_tool_called` (property `tool`) and `ai_handoff_to_human`. A handoff also
creates a `leads` row (`source: 'chat_handoff'`). See
[`METRICS.md`](./METRICS.md).

### Tools

`buildTools()` in `apps/web/src/lib/ai/tools.ts` declares them. Each tool has a
strict input schema. Each returns text for the model and, optionally, a widget
for the chat UI (`airbnb_quote`, `links`, `handoff`). Tools reuse the production
code, so the concierge and the website never disagree.

| Tool                    | Purpose                                                                                                                                                         | Inputs                                                                            | Backed by                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `get_airbnb_quote`      | Monthly fee for full management, plus what the host keeps. **The only source of the Luxel price.** An optional upper revenue bound turns one call into a range. | `listings`, `monthly_revenue_clp?`, optional upper revenue bound                  | `planMonthlyCost()` in `lib/plan-pricing`             |
| `get_pricing_reference` | Market reference for a nightly rate, an occupancy rate or an expected revenue. **The only source of those numbers.** It returns no numbers when none are real.  | the property facts the visitor gave (comuna or address, bedrooms, size, capacity) | `lib/pricelabs`, mirrored reservation data            |
| `get_host_status`       | Real data for the signed-in host: listings, upcoming stays, occupancy, estimated revenue.                                                                       | none (uses `ToolContext.customerId`)                                              | `fetchProperties()`, `listHospitableCalendar()`       |
| `share_links`           | Clickable buttons to curated routes. The model picks keys; the server resolves hrefs.                                                                           | `destinations[]` (keys of `LINK_DESTINATIONS`)                                    | static map in `tools.ts`                              |
| `escalate_to_human`     | Hand off to a person over WhatsApp. Sets `handoff`.                                                                                                             | `reason?`                                                                         | `workingHoursStatus()`, `NEXT_PUBLIC_WHATSAPP_NUMBER` |

`PRICELABS_API_KEY` is not set today, and Luxel manages one listing. So
`get_pricing_reference` has no source with a large enough sample and returns no
numbers. That is the designed answer, not a failure: one host's income must
never reach a stranger. The tool tells Lux to offer the pricing proposal
instead.

**Requesting a plan stays a deliberate user action.** Lux guides to
`/calculator` and to `/properties`. It never requests a plan, never activates
one and never charges. This is a safety choice, not a limitation.

---

## 3. Guest-reply pipeline

Trigger: Hospitable posts `message.created` to
`POST /api/channels/hospitable`
(`apps/web/src/app/api/channels/[provider]/route.ts`).

1. **Route.** The route resolves the plugin from the `[provider]` URL segment
   (`channelPlugin()` in `lib/channels/registry.ts`). An unknown id answers 404.
   It authorises by source IP (`lib/channels/webhook-auth.ts`). It reads only
   the reservation id from the payload, never the body. It answers 200 and
   continues in `after()`.
2. **Ingest.** `ingestThread()` (`lib/channels/hospitable-sync.ts`) reads the
   thread back from Hospitable with Luxel's own credential. It stores host and
   guest messages. It calls `handleInboundMessage()` for each guest message
   newer than the account's `messages_synced_at` watermark. An account with no
   watermark imports its history silently.
3. **Store.** `handleInboundMessage()` (`lib/channels/pipeline.ts`) drops
   duplicates by `external_id`. It upserts `guest_threads` and inserts the
   inbound row in `guest_messages`.
4. **Operator switch.** If `properties.ai_replies` is false, the thread becomes
   `needs_host`. Nothing is sent. Only a Luxel operator changes `ai_replies`;
   hosts have no toggle.
5. **Ground.** `buildGrounding()` (`lib/ai/grounding.ts`) collects the
   property's `learned_answers` and its past guest→answer pairs. A property
   with no history gets anonymized pairs from other properties, marked as
   generic. Every snippet passes `redactSecrets()` (`lib/ai/redact.ts`):
   keyless codes and wifi passwords become `[dato de acceso]`. Cross-property
   snippets also lose emails and phone numbers. The last 8 messages of the
   thread are appended.
6. **Draft.** `draftGuestReply()` (`lib/ai/copilot.ts`) builds the context from
   the synced listing: capacity, times, amenities, rules, access method, wifi
   name (never the password), listing texts, `guest_info`, and the grounding.
   One Chat Completions call at `temperature 0.3`. The system prompt forbids
   invented facts and access codes. It asks for the tag `[HANDOFF]` when the
   answer is missing, the guest is frustrated, or the guest asks for a person.
7. **Handoff.** If the reply carries `[HANDOFF]` or is empty, the thread becomes
   `needs_host`. The tag is stripped; the draft is kept for the Luxel operator.
   Without an API key the result is `handoff` with reason `no_ai`.
8. **Send.** Otherwise `getMessageSender(channel).send()` posts the reply into
   the Airbnb thread with the property owner's Hospitable token
   (`hospitableTokenForCustomer()`). The outbound row is stored with
   `source: 'ai'`.

`needs_host` is a literal. It means "this thread needs a Luxel human". Hosts do
not see guest threads; there is no host inbox.

The local adapter (`provider: 'local'`, dev only, behind `LUXEL_DEV_MOCK`) runs
the same pipeline without Hospitable.

---

## 4. Guardrails & Safety

- **Scope.** Lux talks only about Luxel's management service. Off-topic
  requests get a polite redirect.
- **Never invents the Luxel price.** The fee comes from `get_airbnb_quote`. The
  prompt forbids estimates.
- **Never invents a market number.** A nightly rate, an occupancy rate, a
  cleaning fee or an expected monthly revenue must come from a tool. The prompt
  forbids the number in every form: a range, a "referencial" figure, an
  "aproximado", a "suele estar entre". No tool number means no number. The
  prompt states that no answer beats an invented one.
- **Never sends the visitor to do our work.** The prompt bans "revisa la
  competencia" and every variant. Dynamic pricing is the product.
- **Never asks twice.** After one unanswered request for an input, Lux changes
  tack and offers the pricing proposal.
- **Leads with what the host keeps.** A quote says the host's net amount first
  and the Luxel fee second. It also says that the guest cleaning fee goes whole
  to the crew and pays no commission.
- **One quote per answer.** A revenue range is one `get_airbnb_quote` call with
  the upper bound, not two widgets.
- **Real host data only.** `get_host_status` reads the signed-in account. A
  signed-out user gets no host data.
- **No URLs in prose.** Links come from `share_links`. The model picks keys; the
  server resolves labels and hrefs.
- **PII.** Chat runs server-side. Identity comes from the Clerk session
  (`auth()`), never from the text. Lux does not ask for RUT or card data.
- **Access codes never reach a guest through the AI.** Redaction in grounding,
  exclusion from the listing context, and the system prompt all block them.
  Guests get the codes through Hospitable's check-in rule, 3 days before
  arrival.
- **Bounded loop.** 6 tool rounds, 1024 output tokens, 60 s. Malformed tool
  arguments produce an error message for the model. The tool does not run.
- **Handoff.** `escalate_to_human` creates a lead and shows the WhatsApp link
  with the working-hours status. A guest thread flips to `needs_host` for
  Luxel's operators. Hosts have no inbox.
- **Operator switch.** `ai_replies = false` on a property stops auto-replies for
  that property. Operator-only.
- **Rate limiting.** The human bridge (`/api/chat/human`) rate-limits. The AI
  route relies on the caps above.

---

## 5. Prompt design

Both prompts are code, not config:

- `lib/ai/system-prompt.ts` — `buildSystemPrompt()`. Sections: the identity (a
  partner that gives the host the time back); the service; the
  one fee (`PLAN_LABEL` and `PLAN_PRICE_LINE` from `lib/ai/tools.ts`, which read
  `PLAN_COMMISSION_PCT`); critical rules (no invented Luxel price, no invented
  market number, never ask twice, never send the visitor to research, reuse what
  the visitor said, the host manages neither crew nor guests, `share_links` for
  every navigation, no URLs, stay on topic, no sensitive data, hide reasoning);
  the answer shape for "what do I charge per night"; how to quote (net kept
  first, one quote per answer, the cleaning fee pays no commission); next steps
  (the host requests the plan on the site; Luxel activates it);
  `escalate_to_human`. Tools: `get_airbnb_quote`, `get_pricing_reference`,
  `get_host_status`, `share_links`, `escalate_to_human`.
- `lib/ai/copilot.ts` — `SYSTEM`. Short, warm Spanish. Only the supplied
  property info. Missing answer → `[HANDOFF]`. Frustration or "a person" →
  `[HANDOFF]`. Never access codes or wifi passwords; they arrive 3 days before
  arrival.

Principles: role and boundaries first; the partner voice; tool-first for facts;
Chilean, warm, concise (`tú`); always a next step; graceful handoff.

---

## 6. Future AI opportunities

- **Host win-back** — drafts for hosts whose plan is `cancelled`, from their
  plan history and calendar data.
- **Review summarization** — condense reviews into trust signals for landing
  pages.
- **Monthly report drafting** — a plain-language summary of occupancy, revenue
  and incidents per listing.

---

## 7. Environment

| Variable                      | Effect                                                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`              | Required for any AI answer. Absent: `getOpenAI()` returns null, Lux streams the fixed fallback, and guest threads go to `needs_host` (a Luxel human answers) with reason `no_ai`. No error surfaces. |
| `OPENAI_MODEL`                | Optional. Defaults to `gpt-4o-mini`.                                                                                                                                                                 |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | The handoff link Lux shows.                                                                                                                                                                          |
| `PRICELABS_API_KEY`           | Not set today. Without it `get_pricing_reference` has no market source and returns no numbers. Lux then offers the pricing proposal. It never fills the gap with an estimate.                        |
| `LUXEL_DEV_MOCK`              | Dev only. Simulates guest drafts without a key. Never set in production.                                                                                                                             |

Set them in `apps/web/.env.local` locally and in the Vercel `luxel-web` project.
There is no Anthropic key. See [`ENV.md`](./ENV.md).
