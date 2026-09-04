import { describe, it, expect } from 'vitest';
import {
  collapseWidgets,
  type AirbnbQuoteWidget,
  type LinksWidget,
  type Widget,
} from '@/components/chat/widget-collapse';

const quote: AirbnbQuoteWidget = {
  kind: 'airbnb_quote',
  listings: 1,
  revenueClp: 900_000,
  monthlyClp: 108_000,
};

const links = (...hrefs: string[]): LinksWidget => ({
  kind: 'links',
  actions: hrefs.map((href) => ({ label: href, href, style: 'primary' })),
});

function hrefsOf(widgets: Widget[]): string[] {
  const found = widgets.find((w): w is LinksWidget => w.kind === 'links');
  return (found?.actions ?? []).map((a) => a.href);
}

describe('collapseWidgets', () => {
  it('drops the link the quote card already carries', () => {
    const out = collapseWidgets([quote, links('/calculator', '/properties')]);
    expect(hrefsOf(out)).toEqual(['/properties']);
  });

  it('drops a links widget that becomes empty', () => {
    const out = collapseWidgets([quote, links('/calculator')]);
    expect(out.some((w) => w.kind === 'links')).toBe(false);
    expect(out).toHaveLength(1);
  });

  it('leaves the links alone when no quote card is shown', () => {
    const out = collapseWidgets([links('/calculator', '/properties')]);
    expect(hrefsOf(out)).toEqual(['/calculator', '/properties']);
  });

  it('never repeats a destination across two links widgets', () => {
    const out = collapseWidgets([quote, links('/properties'), links('/properties', '/about')]);
    const all = out
      .filter((w): w is LinksWidget => w.kind === 'links')
      .flatMap((w) => w.actions.map((a) => a.href));
    expect(all).toEqual(['/properties', '/about']);
  });

  it('still merges two quotes into one card', () => {
    const out = collapseWidgets([quote, { ...quote, revenueClp: 1_100_000, monthlyClp: 132_000 }]);
    expect(out.filter((w) => w.kind === 'airbnb_quote')).toHaveLength(1);
  });
});
