export type Timeblock = 'manana' | 'tarde';
export type ServiceFrequency = 'one_time' | 'weekly' | 'biweekly' | 'monthly';
export type ToolsProvider = 'customer' | 'company';

export interface OperationPoint {
  id: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  serviceRadiusKm: number;
  active: boolean;
}

export interface ServiceType {
  id: string;
  slug: string;
  nameKey: string;
  descriptionKey: string;
  baseRateClp: number;
  perM2RateClp: number;
}

export interface PriceQuote {
  totalClp: number;
  breakdown: {
    base: number;
    perM2: number;
    distance: number;
    tools: number;
    subscriptionDiscount: number;
  };
  operationPointId: string;
  distanceKm: number;
}
