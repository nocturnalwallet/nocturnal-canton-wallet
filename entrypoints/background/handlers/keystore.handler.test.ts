import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleResetKeystoreForRecovery } from './keystore.handler';

vi.mock('@lib/storage', () => ({
  localStore: {
    set: vi.fn(),
    get: vi.fn(),
  },
  sessionStore: {
    clear: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

import { localStore, sessionStore } from '@lib/storage';

describe('handleResetKeystoreForRecovery', () => {
  beforeEach(() => {
    vi.mocked(localStore.set).mockReset();
    vi.mocked(sessionStore.clear).mockReset();
  });

  it('sets keystore to null and onboardingComplete to false', async () => {
    const result = await handleResetKeystoreForRecovery();
    expect(result).toEqual({ success: true, data: null });
    expect(localStore.set).toHaveBeenCalledWith('keystore', null);
    expect(localStore.set).toHaveBeenCalledWith('onboardingComplete', false);
  });

  it('does NOT clear sessionStore', async () => {
    await handleResetKeystoreForRecovery();
    expect(sessionStore.clear).not.toHaveBeenCalled();
  });

  it('returns err when localStore.set throws', async () => {
    vi.mocked(localStore.set).mockRejectedValueOnce(new Error('storage write failed'));
    const result = await handleResetKeystoreForRecovery();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/storage write failed/);
    }
  });
});
