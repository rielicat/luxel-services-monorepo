/**
 * Client-safe add-on catalogue: paid extras on top of the flat per-listing
 * management fee (see `plan-pricing.ts`). Prices are CLP per listing per month.
 *
 * Dynamic pricing and its siblings are delivered through PriceLabs. Chile falls
 * in their "rest of world" tier ($9.99/listing/mo) plus $1/listing/mo for API
 * access, and their Hospitable integration bills per PROPERTY rather than per
 * channel listing — so one unit fanned out to Airbnb + Vrbo costs us once.
 * `costUsd` records that basis so a price change is a deliberate margin
 * decision instead of a guess.
 *
 * `needsPricelabs` marks add-ons that only work once the host has authorised
 * PriceLabs against their Hospitable account — a manual OAuth consent on
 * Hospitable's own page that no API can perform for them.
 *
 * `selfServe` false means we cannot deliver it inside Luxel (no public API);
 * the host uses it in PriceLabs' own dashboard.
 */
export const ADDON_KEYS = ['dynamic_pricing', 'listing_optimizer', 'market_dashboards'] as const;
export type AddonKey = (typeof ADDON_KEYS)[number];

export type Addon = {
  key: AddonKey;
  priceClp: number;
  /** Our monthly cost per listing, USD. null = not publicly published. */
  costUsd: number | null;
  needsPricelabs: boolean;
  selfServe: boolean;
};

export const ADDONS: Record<AddonKey, Addon> = {
  // $9.99 subscription + $1 API access.
  dynamic_pricing: {
    key: 'dynamic_pricing',
    priceClp: 19900,
    costUsd: 10.99,
    needsPricelabs: true,
    selfServe: true,
  },
  // PriceLabs does not publish a per-listing price for this tier.
  listing_optimizer: {
    key: 'listing_optimizer',
    priceClp: 14900,
    costUsd: null,
    needsPricelabs: true,
    selfServe: true,
  },
  // No public API — delivered in PriceLabs' own dashboard, from $9.99/mo.
  market_dashboards: {
    key: 'market_dashboards',
    priceClp: 19900,
    costUsd: 9.99,
    needsPricelabs: true,
    selfServe: false,
  },
};

export const addonPrice = (key: AddonKey): number => ADDONS[key].priceClp;
