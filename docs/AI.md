# Servicios Luxel — the Lux agent

> "Lux" is one **eve** agent (`eve@0.51.1`) at `apps/web/agent/`. It serves the
> site concierge and the Airbnb guest replies. Model `gpt-5.6-terra`, pinned in
> code, routed through the Vercel AI Gateway. Prose is English; user-facing copy
> is es-CL.

---

## 1. One agent, two surfaces

`next.config.mjs` wraps the Next.js config with `withEve()`. The agent and the
web app deploy as one Vercel project on one origin. eve is a sidecar service,
not a library: server code reaches it over HTTP at `/eve/v1/*`.

The two surfaces are told apart by the **authenticated principal**, never by
model input. The principal carries `surface`, and the tools, the instructions
and the memory scope all follow it.

| Surface                     | Principal                             | What it does                                                                                                          |
| --------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Lux**, the site concierge | `surface: web`, Clerk user or visitor | Sells and supports Airbnb management. Quotes the fee. Shows a signed-in host real account data. Hands off to a human. |
| Guest replies               | `surface: guest`, internal service    | Answers a guest from the property's own data. Writes a draft. Sends the guest nothing.                                |

A guest turn can never reach a pricing or lead tool, and a web turn can never
reach a property's guest facts. That is a property of the resolver, not of the
prompt.

### Lux by journey stage

| Journey stage                 | How Lux helps                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| Host pre-sale                 | "¿Cuánto cuesta?" → `get_airbnb_quote`. The answer leads with what the host keeps. |
| "What do I charge per night?" | → `get_pricing_reference`. Lux never states a rate of its own.                     |
| Host support                  | A signed-in host asks about occupancy or revenue → `get_host_status`.              |
| Navigation                    | `share_links` renders 1–3 buttons. The model never writes a URL.                   |
| Guest question                | `property_facts` and `reservation_status`. Never an answer from memory.            |
| Guest problem                 | `escalate_to_luxel`. The thread flips to `needs_host`.                             |

### Example flow — the visitor does not know the revenue

1. Lux asks for the monthly revenue **once**.
2. The visitor cannot give it. Lux does not ask again in other words.
3. Lux calls `get_pricing_reference` with what the visitor already gave.
4. The tool returns no numbers today. The web persona carries
   the shape of the answer: reflect the property back in the visitor's own
   words, say the nightly rate is part of the service, explain PriceLabs, and
   offer a pricing proposal.
5. Lux never says "revisa la competencia". That is the work being bought.

### Example flow — the visitor gives a revenue range

Lux calls `get_airbnb_quote` **once** with both bounds. One answer carries one
quote card. The sentence order is what the host keeps first, the Luxel fee
second. Lux adds that the guest cleaning fee goes whole to the crew and pays no
commission.

---

## 2. Architecture

### The agent directory

```
apps/web/agent/
├── agent.ts                 model, reasoning 'none', compaction, limits
├── instructions.md          the small always-on base
├── instructions/persona.ts  dynamic: the web or the guest persona
├── channels/eve.ts          the auth walk and the session-ownership check
├── tools/surface.ts         the dynamic tool map, resolved per principal
├── tools/<builtin>.ts       disableTool() for every permissive default
├── skills/*.md             five procedures, loaded on demand
├── memory/{playbook,property,host}.ts
└── hooks/persist.ts         writes messages, analytics, leads and the digest
```

There are no subagents and no eve schedules. The `agent` builtin is disabled, so
nothing in the agent can delegate, and eve never registers a cron: `withEve`
writes no `crons` key into the Build Output config. The nightly work runs from
the Cloudflare Worker instead.

### The `server-only` boundary

eve cannot import a module carrying `import 'server-only'`: its compiler takes
that package's throwing default export, and eve exposes no condition or alias
knob. The marker is therefore the boundary.

- Agent-facing logic lives in `packages/core/src/agent/` and stays marker-free,
  so **memory recall is a direct call with no HTTP hop**.
- Marked domain logic (`ai/tools`, `host/queries`, `leads`, `channels/*`) is
  reached over `POST /api/agent/tools`, authenticated with
  `INTERNAL_SEND_TOKEN`. That hop costs one round trip, and only when the model
  actually calls a tool.

Never delete a marker to make a build pass, and never add one to a module the
agent imports.

### Route auth and session ownership

`agent/channels/eve.ts` verifies a short-lived HS256 token minted by
`POST /api/agent/session`. eve's route auth identifies a caller but does not
decide which sessions that caller may read, so the same function reads the
session id out of the request URL and refuses a caller who does not own the
`lux_agent_session` row.

The browser never creates a session directly. `POST /api/agent/session` creates
it server-side and claims ownership **before** the id reaches the browser, which
closes the create-then-stream race.

### Memory — three tiers

| Slot       | Scope             | Holds                                                              |
| ---------- | ----------------- | ------------------------------------------------------------------ |
| `playbook` | constant `global` | How Lux behaves, distilled from every property. Recalled each turn |
| `property` | the property id   | That unit's own facts, retrieved by relevance                      |
| `host`     | the customer id   | A signed-in host's durable preferences                             |

The conversation itself is eve's **durable session**, keyed to
`guest_threads.agent_session_id`. A guest thread keeps its history, so a reply
follows the conversation instead of a rebuilt string.

Property retrieval is hybrid. `lux_search_notes` and `lux_search_digests` fuse a
Spanish full-text rank with a pgvector cosine rank by reciprocal rank fusion.
The lexical leg uses `lux_any_tsquery`, which rewrites `websearch_to_tsquery`'s
AND into OR — without it a whole guest question matches nothing.

A property with no history falls back to the global digests, marked as generic,
and never cites another property's data as its own.

Capture does not use eve's `capture['turn.completed']` hook. eve emits that
event with the messages alone, so a slot's capture handler never fires. The
digest is written from `agent/hooks/persist.ts`, which already runs on every
settled turn and already knows the surface, the property and the thread.

### Ingesting the real Airbnb threads

Capture on a live turn only records what Lux itself said. That leaves out most
of the corpus: the threads that pre-date the agent, the threads on properties
with `ai_replies` off, the turns that ended in a handoff, and above all the
replies a Luxel operator wrote by hand.

`ingestThreads` reads `guest_messages` directly, so it sees the conversation as
it actually happened. The transcript labels three voices: `Huesped`, `Luxel` for
an operator, and `Lux` for the AI. The prompt names the operator's replies as
the reference for how Lux should sound, which is the point of the whole tier.

It is idempotent and resumable. Each digest is keyed
`thread:<thread id>:<newest message id>`, and `operation_id` is unique, so a
thread is digested once and again only when it gains a message. A run takes the
twenty least-recently-updated threads that have no digest for their current
head, so a first pass backfills the history a batch a night and a timeout costs
nothing.

An approved draft feeds back for free. `sendReplyDraft` writes the text that was
actually sent into `guest_messages`, as `host` when the operator edited it and
`ai` when they approved it unchanged. The next ingest reads that row, so a
correction teaches the playbook and the unapproved draft never does.

### The nightly pass

The Cloudflare Worker's cron (04:23 UTC) calls
`POST /api/agent/distill` with `INTERNAL_SEND_TOKEN`. It does three things in
order.

`ingestThreads` runs first, so the digests it writes are distilled the same
night.

`distillPending` reads the digests that are not distilled yet, across every
property, and writes global playbook rules and property notes. It never invents
a market figure.

`runPricingPass` then takes the eight properties analysed longest ago, reads
each one's real occupancy and the comparable market reference, and writes at
most two property notes per unit with `source` `pricing`. It only uses the
figures the two tools return, and it says nothing about the market when the
comparable sample is too small.

Both live behind one route so the worker makes one call. The pass is a plain
server function, not an eve subagent: eve subagents are reachable only through
the `agent` tool, which is disabled on every surface.

### Persistence and analytics

`agent/hooks/persist.ts` writes through `POST /api/agent/events`. It records the
inbound and outbound web messages in `messages`, fires `CHAT_MESSAGE_SENT`, and
creates a lead on handoff. Every row is keyed by the **browser** session id,
which travels in the agent token, so the AI half and the human half of a
conversation stay one thread.

The guest surface does not use the hook. `lib/channels/pipeline.ts` runs the
turn and then writes `guest_reply_drafts` itself, which keeps the review gate in
one tested place.

---

## 3. Guest-reply pipeline

The Hospitable `message.created` webhook reaches
`lib/channels/pipeline.ts`. It writes the inbound row, checks `ai_replies`, then
runs one agent turn against the thread's durable session.

- `ai_replies = false` → the thread flips to `needs_host` before any model call.
- The turn escalates, or returns nothing → `needs_host`.
- `ai_reviews` is on, the default → `recordReplyDraft`, status `pending`. **The
  guest receives nothing.** A Luxel operator approves it at `/inbox`.
- `ai_reviews` is off → the reply is sent through the existing sender.

An approved text that differs from the draft is stored as `host`, not `ai`. Only
one pending draft per thread: a newer guest message supersedes the older one.

---

## 4. Guardrails and safety

- **Scope.** Lux talks only about Luxel's service. Off-topic gets a redirect.
- **Never invents the Luxel price.** It comes from `get_airbnb_quote`.
- **Never invents a market number.** A nightly rate, an occupancy, a cleaning
  fee or an expected revenue must come from a tool, in every form: a range, a
  "referencial", an "aproximado". No tool number means no number.
- **Never sends the visitor to do our work.** "Revisa la competencia" is banned.
  Dynamic pricing is the product.
- **Never asks twice.** After one unanswered request, Lux changes tack.
- **Leads with what the host keeps.** The Luxel fee comes second.
- **One quote per answer.** A range is one call with both bounds.
- **Real host data only.** `get_host_status` needs a signed-in principal.
- **No URLs in prose.** Links come from `share_links`.
- **Access codes never reach a guest.** `property_facts` excludes the door code,
  the guest persona forbids it, and `sanitizeForMemory` redacts every known
  `property_access.keyless_code` before anything is stored. Guests receive the
  code through Hospitable's T-3 rule.
- **Memory is untrusted data.** Recalled records enter as user-role messages.
  The base instructions say they are learned facts, not system rules.
- **Nothing sensitive is stored.** Every write passes `sanitizeForMemory`, which
  redacts known codes and strips emails and phone numbers.
- **Every permissive default tool is disabled.** `bash`, `read_file`,
  `write_file`, `web_fetch`, `todo`, `agent`, `ask_question` and `web_search`
  each have a `disableTool()` file. `web_search` especially: it invites the
  model to invent market figures.
- **Handoff.** `escalate_to_human` creates a lead and shows the WhatsApp link
  with the working-hours status. `escalate_to_luxel` flips a guest thread to
  `needs_host`. Hosts have no inbox.
- **Operator switch.** `ai_replies = false` stops auto-replies for a property.
- **Rate limiting.** The human bridge (`/api/chat/human`) rate-limits in the
  database.

---

## 5. Prompt design

The always-on prompt is small: identity, the memory trust policy, and the rule
that no figure exists unless a tool returned it. The persona for the active
surface is added at `session.started`.

Two **skills** stay loaded on demand, both on the guest surface:
`huesped-acceso` and `huesped-incidencia`. The web surface carries none.

A skill is not free. Loading one costs a model round trip to ask for it and
another to answer with it in context, measured at about 2.5 seconds of the 7.8
the web chat took to say its first word. The guest surface can pay that, because
a reply there is reviewed by an operator before it is sent. The web chat cannot,
so its three procedures moved into the persona, where they had mostly been
duplicated anyway. `cotizar`, `propuesta-de-precios` and `estado-del-anfitrion`
are gone.

---

## 6. Environment

| Variable                   | Effect when unset                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `LUXEL_AGENT_TOKEN_SECRET` | No token is minted. The chat answers nothing and guest threads go to `needs_host`              |
| `AI_GATEWAY_API_KEY`       | Fine on Vercel, where project OIDC authenticates the Gateway. Off Vercel, the model call fails |
| `INTERNAL_SEND_TOKEN`      | Every tool returns its unavailable answer and no chat message is persisted                     |
| `OPENAI_API_KEY`           | Digests fall back to an extractive summary and retrieval runs on full-text alone               |
| `EVE_AGENT_ORIGIN`         | Optional. Defaults to the app's own origin, which is correct for the single-project deploy     |

See [`ENV.md`](./ENV.md) and [`DEPLOY.md`](./DEPLOY.md).
