# Multi-tenant channel access — verified constraints

Business model: Luxel manages hosts centrally. A host grants Luxel access to
their own account; Luxel runs the automation; each host sees only their own
properties.

Researched July 2026 against Hospitable's published OpenAPI spec (the document
`developer.hospitable.com` renders) and their help centre.

## The constraint that shapes everything

**A Hospitable API token is scoped to exactly ONE account.**

- Authentication page, verbatim: *"These tokens are scoped to your Hospitable
  account only."*
- `GET /v2/user` → `acting_user` is documented as the secondary user acting
  *"on behalf of the team owner"*; the token resolves to one team owner.
- `GET /v2/properties/search` → *"always return all properties in **the
  account**."*
- No account/team/tenant parameter exists in any of the 49 documented paths.
  There is no `GET /v2/accounts` and no `GET /v2/teams`.

This is a constraint on *accounts*, not on listings. One token does not span
Hospitable accounts — adding Luxel as a manager on a host's OWN account gives
Luxel UI access (one login, account switcher) but not API access to it. The way
to have one token cover many hosts is therefore to have the listings live in ONE
account: Luxel's.

## The architecture Luxel uses

**Hosts never touch Hospitable.** All listings live inside Luxel's ONE Hospitable
account (each host's Airbnb connected into it as an additional channel), so
Luxel's single token sees every managed listing and Luxel's own app is the host's
only interface. The single-account token scope above is therefore not a
limitation — it is the premise: one account, many connected channels.

The host-facing flow is:

1. Customer signs in, starts the trial or buys.
2. Luxel shows instructions to connect their Airbnb.
3. Their listings appear in Luxel — imported into the central account and
   attributed to them via `listing_assignments`.
4. They choose which automations to enable.

Tenancy is enforced entirely on Luxel's side: `listing_assignments` maps each
listing to exactly one customer, `scopeToCustomer` filters every central fetch to
that set, and ownership is re-verified on every action.

## Alternatives considered (NOT used)

### 1. OAuth per host — each host authorises Luxel at auth.hospitable.com

Rejected: it sends the customer to Hospitable's own login and consent screen,
which this product deliberately never does. Kept here because it is the only path
that yields per-host tokens with observable revocation, should the central model
ever hit a wall. Needs approved-vendor status (partner typeform,
`partners.hospitable.com`).

| | |
|---|---|
| Authorize | `https://auth.hospitable.com/oauth/authorize?client_id=…&response_type=code` |
| Token | `POST https://auth.hospitable.com/oauth/token` (`grant_type=authorization_code`) |
| Refresh | same URL, `grant_type=refresh_token` |
| Auth code TTL | 10 minutes |
| Access token TTL | 12 hours |
| Refresh token TTL | 90 days — must refresh regularly or the host re-authorises |

Why it fits: one token per host, a portal listing connected customers by uuid,
one webhook endpoint for every tenant, and `integration.disconnected` events so
revocation is observable. Also unlocks a one-click install from Hospitable's own
Apps marketplace.

### 2. Secondary user + one token per host account

Luxel's ops identity is invited as a **full-access secondary user** (their May
2026 changelog confirms full-access secondary users can mint API tokens), then
mints a token **from inside that account's context**. Store it as that
customer's own connection (`channel_connections`, encrypted) — i.e. `own` scope.

Two hard gotchas:

- **An email cannot be both a primary and a secondary user.** Provision a
  dedicated ops identity that never owns its own Hospitable account.
- **Property access is granted per property and new properties are not shared
  automatically** — onboarding a host's new listing needs a manual re-share.

Rejected for the same reason plus the operational cost: one token per account,
per-property re-shares, and a dedicated ops identity that can never own its own
Hospitable account.

## What this means for the code

- `central` scope is the steady state: Luxel's token, filtered by assignments.
- `own` scope remains supported for a host who already had their own connection.
- `central` scope is NOT an all-tenant key. It is one account's operator token,
  and `listing_assignments` is what prevents its listings being mis-attributed
  to a customer they don't belong to. `hospitableAccess` therefore withholds it
  from customers with no assignments — otherwise the strict mirror would prune
  their whole tree.
- Tenant attribution is OURS to record (`listing_assignments`), set by an
  operator when a host's listings first appear. Candidate fields for automating
  it — `listings[].platform_user_id` ("the id of the user the listing belongs
  to") and `GET /v2/channels` → `user_id` — identify the connected Airbnb
  account, but neither is verified as a reliable per-owner key yet, so an
  operator confirms attribution rather than the code guessing it.
- Webhooks carry **no account identifier** (`id`, `data`, `action`, `triggers`,
  `created`, `version` only). Attribute events by resolving the property or
  reservation uuid against our mirror. Whitelist source range `38.80.170.0/24`.

PriceLabs is different and unchanged: its Customer API is one key per account,
so Luxel's single PriceLabs account with the ownership-scoped resolver in
`lib/pricelabs/link.ts` is correct as built.

## Still unverified — ask `team-platform@hospitable.com`

1. Does the authorize URL accept a `scope` parameter, or are scopes fixed per
   approved client?
2. Is `user` populated in Property webhooks?
3. Does `include=user` work, given the enum omission?
4. Which plan tier includes API access? The help centre says all paid plans; the
   pricing page renders it as Professional and Mogul only.
5. With Luxel as a full-access secondary user, can Luxel initiate the
   PriceLabs↔Hospitable connection from inside the host's account so those
   listings land in **Luxel's** PriceLabs account? This is the one open question
   in the pricing chain.
