const REDACTED = '[redacted]';
const MEDIA_MARKER = '/cleaning-media/';

const SENSITIVE_PARAMS = new Set([
  'access_token',
  'api_key',
  'key',
  'signature',
  'ticket',
  'token',
]);

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'x-goog-api-key',
  'x-luxel-internal-token',
  'x-luxel-ticket',
]);

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LONG_HEX = /[0-9a-f]{32,}/gi;
const TOKEN_PATH = /\/(checkin|cleaning\/confirm)\/[^/?#]+/gi;

const URL_KEYS = [
  'url',
  'to',
  'from',
  'http.url',
  'http.request.url',
  'url.full',
  'url.path',
  'url.query',
  'server.address',
];

export const REPLAY_BLOCKED_PATHS = ['/cleaning/', '/checkin/'];

export function touchesMedia(value: unknown): boolean {
  return typeof value === 'string' && value.includes(MEDIA_MARKER);
}

function redactIdentifiers(value: string): string {
  return value
    .replace(TOKEN_PATH, (_match, route: string) => `/${route}/${REDACTED}`)
    .replace(UUID, REDACTED)
    .replace(LONG_HEX, REDACTED);
}

export function scrubUrl(value: string): string {
  if (!value) return value;
  if (touchesMedia(value)) return `${MEDIA_MARKER}${REDACTED}`;

  const [withoutHash, ...hash] = value.split('#');
  const [path, ...query] = (withoutHash ?? '').split('?');
  const safePath = redactIdentifiers(path ?? '');
  const suffix = hash.length ? `#${REDACTED}` : '';
  if (!query.length) return `${safePath}${suffix}`;

  const params = new URLSearchParams(query.join('?'));
  for (const name of [...params.keys()]) {
    const current = params.get(name) ?? '';
    params.set(
      name,
      SENSITIVE_PARAMS.has(name.toLowerCase()) ? REDACTED : redactIdentifiers(current),
    );
  }
  const rendered = params.toString();
  return `${safePath}${rendered ? `?${rendered}` : ''}${suffix}`;
}

interface Bag {
  [key: string]: unknown;
}

interface ScrubbableBreadcrumb {
  category?: string;
  type?: string;
  message?: string;
  data?: Bag;
}

interface ScrubbableEvent {
  request?: { url?: string; query_string?: unknown; headers?: Record<string, string> };
  breadcrumbs?: ScrubbableBreadcrumb[];
  spans?: Array<{ description?: string; data?: Bag }>;
  contexts?: { trace?: { data?: Bag } };
}

function scrubBag(bag: Bag | undefined): void {
  if (!bag) return;
  for (const name of URL_KEYS) {
    const value = bag[name];
    if (typeof value === 'string') bag[name] = scrubUrl(value);
  }
}

export function scrubBreadcrumb(input: unknown): unknown {
  const breadcrumb = input as ScrubbableBreadcrumb | null;
  if (!breadcrumb) return input;
  const url = breadcrumb.data?.url;
  if (touchesMedia(url) || touchesMedia(breadcrumb.message)) return null;
  scrubBag(breadcrumb.data);
  if (typeof breadcrumb.message === 'string') {
    breadcrumb.message = redactIdentifiers(breadcrumb.message);
  }
  return breadcrumb;
}

export function scrubEvent(input: unknown): void {
  const event = input as ScrubbableEvent | null;
  if (!event) return;

  if (event.request) {
    if (typeof event.request.url === 'string') event.request.url = scrubUrl(event.request.url);
    if (event.request.query_string !== undefined) event.request.query_string = REDACTED;
    if (event.request.headers) {
      for (const name of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.has(name.toLowerCase())) event.request.headers[name] = REDACTED;
      }
    }
  }

  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.filter(
      (breadcrumb) => scrubBreadcrumb(breadcrumb) !== null,
    );
  }

  if (Array.isArray(event.spans)) {
    for (const span of event.spans) {
      if (typeof span.description === 'string') span.description = scrubUrl(span.description);
      scrubBag(span.data);
    }
  }

  scrubBag(event.contexts?.trace?.data);
}
