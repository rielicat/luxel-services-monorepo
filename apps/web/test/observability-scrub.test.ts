import { describe, it, expect } from 'vitest';
import {
  REPLAY_BLOCKED_PATHS,
  scrubBreadcrumb,
  scrubEvent,
  scrubUrl,
  touchesMedia,
} from '../src/lib/observability/scrub';

const TOKEN = '11111111-2222-4333-8444-555555555500';
const TICKET = 'v2.abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MEDIA_URL = `https://worker.test/cleaning-media/object?ticket=${TICKET}`;
const CREW_URL = `https://serviciosluxel.cl/cleaning/confirm/${TOKEN}`;

describe('sentry scrubbing', () => {
  it('never lets a media URL or a ticket through', () => {
    expect(touchesMedia(MEDIA_URL)).toBe(true);
    const scrubbed = scrubUrl(MEDIA_URL);
    expect(scrubbed).not.toContain('ticket=');
    expect(scrubbed).not.toContain(TICKET);
  });

  it('strips the confirm token out of the crew page URL', () => {
    const scrubbed = scrubUrl(CREW_URL);
    expect(scrubbed).not.toContain(TOKEN);
    expect(scrubbed).toContain('/cleaning/confirm/');
  });

  it('redacts a model key and a long hex handle in a query string', () => {
    const scrubbed = scrubUrl(
      'https://generativelanguage.googleapis.com/v1beta/files/abc?key=super-secret',
    );
    expect(scrubbed).not.toContain('super-secret');
  });

  it('drops a breadcrumb that touches the media routes', () => {
    expect(scrubBreadcrumb({ category: 'xhr', data: { url: MEDIA_URL } })).toBeNull();
  });

  it('scrubs a breadcrumb that only carries a token', () => {
    const breadcrumb = scrubBreadcrumb({
      category: 'navigation',
      data: { from: '/', to: CREW_URL },
    }) as { data?: Record<string, unknown> } | null;
    expect(String(breadcrumb?.data?.to)).not.toContain(TOKEN);
  });

  it('cleans an event end to end: request, breadcrumbs, spans and the trace context', () => {
    const event = {
      request: {
        url: CREW_URL,
        query_string: `ticket=${TICKET}`,
        headers: { 'x-luxel-ticket': TICKET, 'user-agent': 'test' },
      },
      breadcrumbs: [
        { category: 'xhr', data: { url: MEDIA_URL } },
        { category: 'fetch', data: { url: CREW_URL } },
      ],
      spans: [{ description: `PUT ${MEDIA_URL}`, data: { 'http.url': MEDIA_URL } }],
      contexts: { trace: { data: { 'url.full': CREW_URL } } },
    };

    scrubEvent(event);
    const dump = JSON.stringify(event);

    expect(dump).not.toContain(TICKET);
    expect(dump).not.toContain(TOKEN);
    expect(dump).not.toContain('/cleaning-media/object');
    expect(event.breadcrumbs).toHaveLength(1);
    expect(event.request.headers['user-agent']).toBe('test');
  });

  it('keeps replay off the two pages that show a home and its guest', () => {
    expect(REPLAY_BLOCKED_PATHS).toContain('/cleaning/');
    expect(REPLAY_BLOCKED_PATHS).toContain('/checkin/');
  });
});
