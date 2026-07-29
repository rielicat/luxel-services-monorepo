# PriceLabs partner enquiry — draft email

Send to **support@pricelabs.co**. Fill the three `[bracketed]` blanks before sending.

Why this email is needed (from research, July 2026):

- PriceLabs' terms grant use "solely for your own internal business purposes" and state the
  services "may not be … sold, resold … for any commercial purpose without our express
  written consent." Reselling and re-displaying PriceLabs output inside Luxel needs that
  consent in writing.
- The **RM Partner API** (`https://api.pricelabs.co/rm/v1`, `X-API-Key` + `PL-User-Id`) is the
  only sanctioned way to hold one credential across many host accounts. Enrollment is not
  publicly documented — it requires this conversation.
- Chile falls in their "rest of world" tier ($9.99/listing/month); the Customer API adds
  $1/listing/month. Volume discounts exist "from the second listing onwards" but the tiers
  are unpublished.

---

**Subject:** Partner enquiry — RM Partner API access + reseller consent (Luxel, Chile)

Hi PriceLabs team,

I'm Catriel Guillén, founder of Luxel (serviciosluxel.cl), a short-term-rental management
platform for hosts in Santiago, Chile. Our hosts run their listings through Hospitable, and we
automate guest messaging, cleaning coordination and pricing on top of it for a flat monthly fee
per property.

We'd like to offer PriceLabs dynamic pricing to our hosts as a paid add-on, and I'd rather set
it up properly with you than improvise. Three things I'd like to sort out:

**1. Written consent to resell.** Your terms limit use to "your own internal business purposes"
and prohibit resale without express written consent. Our intended model is that Luxel bills the
host a single monthly amount and covers their PriceLabs subscription, and that we surface
PriceLabs data (recommended nightly rates, min-stay suggestions and neighbourhood comps) inside
our own dashboard. Could you confirm in writing whether that is permitted, and under what terms?

**2. RM Partner API access.** Your docs describe an RM Partner API at
`https://api.pricelabs.co/rm/v1` using `X-API-Key` plus a `PL-User-Id` header to target managed
accounts, but I couldn't find a public application path or details of the PL Experts Dashboard.
How do we apply, what are the requirements, and does each of our hosts still need their own
PriceLabs account under our umbrella key?

**3. Commercials.** We're in the "rest of world" tier at $9.99/listing/month plus $1/listing for
the Customer API. Could you share:

- the volume discount tiers (the plans page mentions a sliding scale from the second listing but
  doesn't publish the steps), and whether a partner rate applies at our expected volume of
  roughly [N] properties in year one;
- the per-listing price for **Listing Optimizer**, which isn't published on your product page;
- whether **Market Dashboards** can be provisioned or surfaced through any API, or whether hosts
  must always use your dashboard directly.

One operational question while I have you: the PriceLabs ↔ Hospitable connection is an OAuth
consent each host performs themselves. Is there any partner-initiated flow — an invite link or a
programmatic provisioning step — or should we plan on guiding every host through the manual
authorisation?

Happy to jump on a call. We're based in Santiago (UTC−4) and flexible on timing.

Best regards,
Catriel Guillén
Founder, Luxel — [email]
[phone]
