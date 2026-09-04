import { describe, it, expect } from 'vitest';
import { workerSendUrl } from '@luxel/core/whatsapp/send';

describe('workerSendUrl', () => {
  it('adds the send path when the variable holds only the worker origin', () => {
    expect(workerSendUrl('https://worker.example.com')).toBe('https://worker.example.com/send');
    expect(workerSendUrl('https://worker.example.com/')).toBe('https://worker.example.com/send');
  });

  it('leaves an explicit path alone', () => {
    expect(workerSendUrl('https://worker.example.com/send')).toBe(
      'https://worker.example.com/send',
    );
    expect(workerSendUrl('https://worker.example.com/custom')).toBe(
      'https://worker.example.com/custom',
    );
  });

  it('treats a missing or unusable value as unconfigured', () => {
    expect(workerSendUrl(undefined)).toBeNull();
    expect(workerSendUrl('   ')).toBeNull();
    expect(workerSendUrl('not a url')).toBeNull();
  });
});
