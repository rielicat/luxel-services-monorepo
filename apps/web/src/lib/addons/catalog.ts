export const ADDON_KEYS = ['dynamic_pricing', 'listing_optimizer', 'market_dashboards'] as const;
export type AddonKey = (typeof ADDON_KEYS)[number];

export type Addon = {
  key: AddonKey;
  priceClp: number;
  costUsd: number | null;
  needsPricelabs: boolean;
  selfServe: boolean;
};

export const ADDONS: Record<AddonKey, Addon> = {
  dynamic_pricing: {
    key: 'dynamic_pricing',
    priceClp: 19900,
    costUsd: 10.99,
    needsPricelabs: true,
    selfServe: true,
  },
  listing_optimizer: {
    key: 'listing_optimizer',
    priceClp: 14900,
    costUsd: null,
    needsPricelabs: true,
    selfServe: true,
  },
  market_dashboards: {
    key: 'market_dashboards',
    priceClp: 19900,
    costUsd: 9.99,
    needsPricelabs: true,
    selfServe: false,
  },
};
