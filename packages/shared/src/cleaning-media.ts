export const WALKTHROUGH_CONTENT_TYPES = ['video/mp4', 'video/webm'] as const;
export type WalkthroughContentType = (typeof WALKTHROUGH_CONTENT_TYPES)[number];

export const WALKTHROUGH_MAX_BYTES = 32 * 1024 * 1024;
export const WALKTHROUGH_MAX_SECONDS = 120;
export const WALKTHROUGH_RETENTION_DAYS = 30;
export const WALKTHROUGH_KEY_PREFIX = 'walkthrough/';

export const UPLOAD_TICKET_TTL_SECONDS = 15 * 60;
export const READ_TICKET_TTL_SECONDS = 10 * 60;

export const CLEANING_MEDIA_UPLOAD_URL_PATH = '/cleaning-media/upload-url';
export const CLEANING_MEDIA_READ_URL_PATH = '/cleaning-media/read-url';
export const CLEANING_MEDIA_OBJECT_PATH = '/cleaning-media/object';
export const CLEANING_MEDIA_TICKET_HEADER = 'x-luxel-ticket';

const KEY_SHAPE =
  /^walkthrough\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{32}\.(mp4|webm)$/;

export function isWalkthroughKey(key: string): boolean {
  return KEY_SHAPE.test(key);
}

export function isWalkthroughContentType(value: string): value is WalkthroughContentType {
  return (WALKTHROUGH_CONTENT_TYPES as readonly string[]).includes(value);
}

export function walkthroughExtension(contentType: WalkthroughContentType): 'mp4' | 'webm' {
  return contentType === 'video/webm' ? 'webm' : 'mp4';
}

export interface WalkthroughUploadRequest {
  cleaningId: string;
  contentType: WalkthroughContentType;
  bytes?: number;
}

export interface WalkthroughUploadTicket {
  key: string;
  uploadUrl: string;
  ticket: string;
  expiresAt: string;
  maxBytes: number;
}

export interface WalkthroughReadRequest {
  key: string;
}

export interface WalkthroughReadTicket {
  url: string;
  ticket: string;
  expiresAt: string;
}

export interface WalkthroughStoredObject {
  key: string;
  bytes: number;
  contentType: string;
}
