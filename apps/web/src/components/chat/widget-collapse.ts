export type HandoffWidget = {
  kind: 'handoff';
  withinHours: boolean;
  openHour: number;
  closeHour: number;
};
export type AirbnbQuoteWidget = {
  kind: 'airbnb_quote';
  listings: number;
  planLabel?: string;
  revenueClp: number | null;
  revenueMaxClp?: number | null;
  keptMaxClp?: number | null;
  monthlyMaxClp?: number | null;
  monthlyClp: number;
  keptClp?: number | null;
};
export type LinksWidget = {
  kind: 'links';
  actions: { label: string; href: string; style: 'primary' | 'outline' }[];
};
export type Widget = HandoffWidget | AirbnbQuoteWidget | LinksWidget;

function mergeQuotes(a: AirbnbQuoteWidget, b: AirbnbQuoteWidget): AirbnbQuoteWidget {
  const bounds = [a.revenueClp, a.revenueMaxClp, b.revenueClp, b.revenueMaxClp].filter(
    (v): v is number => v != null && v > 0,
  );
  const fees = [a.monthlyClp, b.monthlyClp];
  const kept = [a.keptClp, b.keptClp].filter((v): v is number => v != null && v > 0);
  return {
    ...a,
    revenueClp: bounds.length ? Math.min(...bounds) : a.revenueClp,
    revenueMaxClp: bounds.length ? Math.max(...bounds) : a.revenueMaxClp,
    monthlyClp: Math.min(...fees),
    keptClp: kept.length ? Math.min(...kept) : null,
  };
}

const QUOTE_CARD_HREF = '/calculator';

export function collapseWidgets(widgets: Widget[]): Widget[] {
  const out: Widget[] = [];
  let quoteAt = -1;
  for (const w of widgets) {
    if (w.kind !== 'airbnb_quote') {
      out.push(w);
      continue;
    }
    if (quoteAt < 0) {
      quoteAt = out.push(w) - 1;
      continue;
    }
    out[quoteAt] = mergeQuotes(out[quoteAt] as AirbnbQuoteWidget, w);
  }
  if (quoteAt < 0) return out;

  const seen = new Set([QUOTE_CARD_HREF]);
  const deduped: Widget[] = [];
  for (const w of out) {
    if (w.kind !== 'links') {
      deduped.push(w);
      continue;
    }
    const actions = w.actions.filter((a) => !seen.has(a.href));
    for (const a of actions) seen.add(a.href);
    if (actions.length) deduped.push({ ...w, actions });
  }
  return deduped;
}
