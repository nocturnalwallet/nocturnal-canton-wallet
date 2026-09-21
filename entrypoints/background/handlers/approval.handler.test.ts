import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as { chrome?: unknown }).chrome = {
  runtime: { getURL: (p: string) => `chrome-extension://test/${p}` },
  windows: { onRemoved: { addListener: vi.fn() } },
};
vi.stubGlobal('crypto', { randomUUID: () => 'req-1' });

vi.mock('@lib/utils', () => ({
  createCenteredPopup: vi.fn(async () => ({ id: 1 })),
}));

import { requestApproval, resolveApproval } from './approval.handler';

describe('approval.handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves with approved + password', async () => {
    const p = requestApproval('signMessage', 'https://dapp.example', { message: 'hi' });
    await Promise.resolve();
    resolveApproval('req-1', true, 'secret-pw');
    await expect(p).resolves.toEqual({ approved: true, password: 'secret-pw' });
  });

  it('resolves approved:false with no password on reject', async () => {
    const p = requestApproval('signMessage', 'https://dapp.example', {});
    await Promise.resolve();
    resolveApproval('req-1', false);
    await expect(p).resolves.toEqual({ approved: false, password: undefined });
  });
});
