import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendMessage, err, MessagingError } from './protocol';

describe('MessagingError', () => {
  it('carries status and retryAfterSeconds from err()', () => {
    const response = err('Rate limited', { status: 429, retryAfterSeconds: 30 });
    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.error).toBe('Rate limited');
      expect(response.status).toBe(429);
      expect(response.retryAfterSeconds).toBe(30);
    }
  });
});

describe('sendMessage', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn(),
      },
    });
  });

  it('throws MessagingError with status extras on failure', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(
      err('Rate limited', { status: 429, retryAfterSeconds: 30 }),
    );

    await expect(sendMessage({ action: 'GET_LOCK_STATE' as never })).rejects.toThrow(MessagingError);

    try {
      await sendMessage({ action: 'GET_LOCK_STATE' as never });
    } catch (e) {
      expect(e).toBeInstanceOf(MessagingError);
      const err = e as MessagingError;
      expect(err.message).toBe('Rate limited');
      expect(err.status).toBe(429);
      expect(err.retryAfterSeconds).toBe(30);
    }
  });
});
