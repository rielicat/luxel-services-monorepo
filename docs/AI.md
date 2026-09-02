# Servicios Luxel — AI Concierge & Guest-Reply Pipeline

> "Lux", the AI concierge, and the guest auto-replies. OpenAI Node SDK
> (`openai`) · model `gpt-4o-mini` (`OPENAI_MODEL` override) · SSE streaming ·
> tool-use. Prose is English; user-facing copy is es-CL.

---

## 1. Two AI surfaces

The AI does two jobs. Both use the same client
(`apps/web/src/lib/ai/client.ts`).

| Surface                     | Where                                                             | What it does                                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lux**, the site concierge | Chat widget → `POST /api/chat`                                    | Sells and supports Airbnb management. Estimates the monthly plan with `get_airbnb_quote`. Shows a signed-in host real account data. Hands off to a human on WhatsApp. |
| Guest auto-replies          | Hospitable `message.created` webhook → `lib/channels/pipeline.ts` | Answers a guest in the Airbnb thread from the property's own data. Flags the thread for a Luxel human when it cannot answer.                                          |

### Lux by journey stage

| Journey stage | How Lux helps                                                                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host pre-sale | "¿Cuánto cuesta administrar 3 deptos?" → `get_airbnb_quote` returns the three plans (Fijo 99.900; Mixto 49.900 + 6%; Comisión 12%). With the monthly revenue it returns the estimate per plan and marks the cheapest. |
| Host support  | A signed-in host asks about occupancy, upcoming stays or revenue → `get_host_status`.                                                                                                                                 |
| Navigation    | `share_links` renders 1–3 buttons to real routes. The model never writes a URL.                                                                                                                                       |
| Human handoff | Anything it cannot or must not do → `escalate_to_human` (WhatsApp).                                                                                                                                                   |

Lux compresses the funnel. It turns a visitor into a plan request inside one
conversation. It hands off when a human is the right answer.

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

| Tool                | Purpose                                                                                   | Inputs                                                                            | Backed by                                                   |
| ------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `get_airbnb_quote`  | Monthly cost of full management per plan. **The only source of plan prices.**             | `listings`, `plan?` (`fixed` \| `hybrid` \| `commission`), `monthly_revenue_clp?` | `planMonthlyCost()`, `cheapestPlan()` in `lib/plan-pricing` |
| `get_host_status`   | Real data for the signed-in host: listings, upcoming stays, occupancy, estimated revenue. | none (uses `ToolContext.customerId`)                                              | `fetchProperties()`, `listHospitableCalendar()`             |
| `share_links`       | Clickable buttons to curated routes. The model picks keys; the server resolves hrefs.     | `destinations[]` (keys of `LINK_DESTINATIONS`)                                    | static map in `tools.ts`                                    |
| `escalate_to_human` | Hand off to a person over WhatsApp. Sets `handoff`.                                       | `reason?`                                                                         | `workingHoursStatus()`, `NEXT_PUBLIC_WHATSAPP_NUMBER`       |

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
4. **Operator switch.** If `properties.ai_enabled` is false, the thread becomes
   `needs_host`. Nothing is sent. Only a Luxel operator changes `ai_enabled`;
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
- **Never invents prices.** Plan fees come from `get_airbnb_quote`. The prompt
  forbids estimates.
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
- **Operator switch.** `ai_enabled = false` on a property stops auto-replies for
  that property. Operator-only.
- **Rate limiting.** The human bridge (`/api/chat/human`) rate-limits. The AI
  route relies on the caps above.

---

## 5. Prompt design

Both prompts are code, not config:

- `lib/ai/system-prompt.ts` — `buildSystemPrompt()`. Sections: the service and
  the three plans (`PLAN_PRICE_LINES` from `lib/plan-pricing`); critical rules
  (no invented prices, one tool per fact, the host manages neither crew nor
  guests, `share_links` for every navigation, no URLs, stay on topic, no
  sensitive data, hide reasoning); next steps (the host requests a plan on the
  site; Luxel activates it); `escalate_to_human`. Tools: `get_airbnb_quote`,
  `get_host_status`, `share_links`, `escalate_to_human`.
- `lib/ai/copilot.ts` — `SYSTEM`. Short, warm Spanish. Only the supplied
  property info. Missing answer → `[HANDOFF]`. Frustration or "a person" →
  `[HANDOFF]`. Never access codes or wifi passwords; they arrive 3 days before
  arrival.

Principles: role and boundaries first; tool-first for facts; Chilean, warm,
concise (`tú`); always a next step; graceful handoff.

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
| `LUXEL_DEV_MOCK`              | Dev only. Simulates guest drafts without a key. Never set in production.                                                                                                                             |

Set them in `apps/web/.env.local` locally and in the Vercel `luxel-web` project.
There is no Anthropic key. See [`ENV.md`](./ENV.md).
