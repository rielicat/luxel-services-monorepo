import { PLAN_COMMISSION_PCT } from '../plan-pricing';

export const clp = (n: number) => '$' + n.toLocaleString('es-CL');

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export const PLAN_LABEL = 'Plan Luxel';

export const PLAN_PRICE_LINE = `${pct(PLAN_COMMISSION_PCT)} de los ingresos por reservas, sin costo fijo`;
