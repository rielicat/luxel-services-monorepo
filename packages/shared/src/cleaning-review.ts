import {
  INVENTORY_DIFFERENCE_KINDS,
  INVENTORY_MAX_NOTE,
  INVENTORY_MAX_TEXT,
  type InventoryDifferenceKind,
} from './cleaning-inventory';

export const REVIEW_STATUSES = ['queued', 'running', 'done', 'skipped', 'failed'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_REASONS = [
  'no_baseline',
  'no_inventory',
  'no_video',
  'video_unreadable',
  'model_unavailable',
  'model_failed',
  'attempts_exhausted',
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

export const REVIEW_SOURCES = ['compare', 'video'] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

export const REVIEW_MAX_ATTEMPTS = 5;
export const REVIEW_MAX_FINDINGS = 40;
export const REVIEW_CLAIM_MS = 5 * 60_000;
export const REVIEW_SWEEP_LIMIT = 50;
export const REVIEW_DIRECT_SWEEP_LIMIT = 5;

export const CLEANING_REVIEW_START_PATH = '/cleaning-review/start';
export const CLEANING_REVIEW_ATTEMPT_PATH = '/api/cleaning/review';
export const CLEANING_REVIEW_WORKFLOW = 'cleaning-review';

export interface ReviewFinding {
  source: ReviewSource;
  kind: InventoryDifferenceKind;
  room: string;
  name: string;
  detail: string;
}

export interface ReviewSweepEntry {
  id: string;
  attempts: number;
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return typeof value === 'string' && (REVIEW_STATUSES as readonly string[]).includes(value);
}

export function isReviewReason(value: unknown): value is ReviewReason {
  return typeof value === 'string' && (REVIEW_REASONS as readonly string[]).includes(value);
}

export function findingFingerprint(finding: ReviewFinding): string {
  return [finding.kind, finding.room.toLowerCase(), finding.name.toLowerCase()].join('|');
}

export function parseFindings(value: unknown): ReviewFinding[] {
  if (!Array.isArray(value)) return [];
  const out: ReviewFinding[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Record<string, unknown>;
    const name = text(raw.name, INVENTORY_MAX_TEXT);
    const detail = text(raw.detail, INVENTORY_MAX_NOTE);
    if (!name && !detail) continue;
    const kind = typeof raw.kind === 'string' ? raw.kind : '';
    const source = typeof raw.source === 'string' ? raw.source : '';
    out.push({
      source: (REVIEW_SOURCES as readonly string[]).includes(source)
        ? (source as ReviewSource)
        : 'video',
      kind: (INVENTORY_DIFFERENCE_KINDS as readonly string[]).includes(kind)
        ? (kind as InventoryDifferenceKind)
        : 'changed',
      room: text(raw.room, INVENTORY_MAX_TEXT),
      name,
      detail,
    });
    if (out.length >= REVIEW_MAX_FINDINGS) break;
  }
  return out;
}

export function mergeFindings(...groups: readonly (readonly ReviewFinding[])[]): ReviewFinding[] {
  const seen = new Set<string>();
  const out: ReviewFinding[] = [];
  for (const group of groups) {
    for (const finding of group) {
      const key = findingFingerprint(finding);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(finding);
      if (out.length >= REVIEW_MAX_FINDINGS) return out;
    }
  }
  return out;
}

export function sameFindings(a: readonly ReviewFinding[], b: readonly ReviewFinding[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map(findingFingerprint).sort();
  const right = b.map(findingFingerprint).sort();
  return left.every((value, index) => value === right[index]);
}

export function retryable(reason: ReviewReason | null): boolean {
  return reason === 'video_unreadable' || reason === 'model_failed';
}
