# Beds24 — questions to confirm before committing

Ready to send. Ordered so the decisive question is first; questions 1 and 2 alone
determine whether the plan is usable.

---

Subject: Channel Management Only plan — API questions before we proceed

Hi,

Thank you for the detail on the Channel Management Only plan. The pricing works
for us. Before we set up a test account I need to confirm a few capabilities,
because our product depends on one of them completely.

**1. Guest messaging on the Channel Management Only plan**

Our product's core function is automated guest communication: we send each guest
a check-in link when their reservation is confirmed, and an AI assistant answers
guest questions in the conversation thread.

- Are `GET /bookings/messages` and `POST /bookings/messages` available on the
  Channel Management Only plan?
- Does a message posted via `POST /bookings/messages` deliver into the **Airbnb
  guest conversation**, or only into Beds24 as an internal note?
- Your plan description excludes "Guest Management". Does that exclusion cover
  the messages API, or does it refer to other features?

If messaging is not available on this plan, which plan is required, and what is
the price difference?

**2. Multiple independent hosts in one account**

We manage properties for several independent hosts in Santiago, Chile. Each host
owns their own Airbnb account.

- Can one Beds24 account hold properties belonging to several different Airbnb
  accounts?
- How does a host authorise the connection? We must never ask a host for their
  Airbnb password, so we need a flow where the host authorises Airbnb themselves
  and the property lands in our account.
- Does any field on a property or booking identify which host account it came
  from? We use that to show each customer only their own properties.
- Alternatively, can each host hold their own Beds24 account and grant us scoped
  API access to their properties only?

**3. API tokens**

- We understand a refresh token expires after 30 days without use. Is that
  correct? We will schedule a monthly refresh, but want to confirm the behaviour
  and whether any notification is sent before a token lapses.
- Can a token be scoped to specific properties (`onlyPropertyId`), and is that
  the recommended way to isolate one client from another?

**4. Endpoint maturity**

Your OpenAPI specification marks `GET /properties` as Beta, `/properties/rooms`
and `/organizations/users` as "Coming soon", and `/accounts` as Alpha.

- Are these safe to build a production integration on?
- Is there a timeline for the "Coming soon" endpoints, and do the Beta/Alpha
  labels imply the response shape may change without notice?

**5. Rate limits**

We plan to synchronise every 30 minutes across roughly 5 to 25 properties, later
more, reading bookings, calendars and messages.

- What credit cost should we expect per request, and what limit applies to an
  account of that size?
- Do limits apply per account, per token, or per IP?

**6. Calendar writes**

We intend to manage nightly pricing for our customers.

- Is `POST /inventory/rooms/calendar` available on the Channel Management Only
  plan, and do writes propagate to Airbnb?
- Are there rate limits specific to calendar writes?

**7. Billing for a Chilean company**

- Prices are quoted in EUR. Is EUR the only billing currency?
- Is EU VAT charged to a company based in Chile, or is a reverse charge applied?
- Is there a minimum contract term or notice period on this plan?

Once questions 1 and 2 are answered we will create a test account and begin
integration work.

Best regards,
Catriel Guillén
Luxel

---

## Why these questions

| #   | If the answer is bad                                                         |
| --- | ---------------------------------------------------------------------------- |
| 1   | The plan cannot run the product at any price. Decisive.                      |
| 2   | The tenancy model does not survive; every host needs their own subscription. |
| 3   | Host connections drop silently after a month of inactivity.                  |
| 4   | The multi-host surfaces are the ones marked least stable.                    |
| 5   | The sync cannot run at the frequency guest messaging requires.               |
| 6   | Owning nightly pricing is not possible on this plan.                         |
| 7   | Unbudgeted VAT, FX exposure, or a lock-in that was not mentioned.            |
