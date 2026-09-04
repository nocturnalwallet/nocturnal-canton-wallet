import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as { chrome?: unknown }).chrome = {
  alarms: { clear: vi.fn(async () => true), create: vi.fn(), onAlarm: { addListener: vi.fn() } },
};

vi.mock('@lib/storage', () => ({
  sessionStore: { get: vi.fn(), set: vi.fn(), touchActivity: vi.fn() },
  localStore: { get: vi.fn() },
}));

vi.mock('../encryption', () => ({
  getEncryptionProvider: vi.fn(),
}));

vi.mock('@lib/constants', () => ({
  AUTO_LOCK_MINUTES: 15,
}));

import { sessionStore } from '@lib/storage';
import {
  setCachedPrivateKey,
  getCachedPrivateKey,
  reconcileUnlockState,
  handleGetLockState,
} from './session.handler';

describe('reconcileUnlockState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCachedPrivateKey(null);
  });

  it('clears stale unlocked flag when private key cache is empty (SW restart)', async () => {
    vi.mocked(sessionStore.get).mockResolvedValue(true);

    await reconcileUnlockState();

    expect(sessionStore.set).toHaveBeenCalledWith('unlocked', false);
    expect(chrome.alarms.clear).toHaveBeenCalledWith('auto-lock');
  });

  it('leaves unlocked alone when the private key is still cached', async () => {
    setCachedPrivateKey('cached-sk');
    vi.mocked(sessionStore.get).mockResolvedValue(true);

    await reconcileUnlockState();

    expect(sessionStore.set).not.toHaveBeenCalled();
  });

  it('is a no-op when already locked', async () => {
    vi.mocked(sessionStore.get).mockResolvedValue(false);

    await reconcileUnlockState();

    expect(sessionStore.set).not.toHaveBeenCalled();
  });
});

describe('handleGetLockState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCachedPrivateKey(null);
  });

  it('reports locked after reconciling a stale unlocked session', async () => {
    let unlockedFlag = true;
    vi.mocked(sessionStore.get).mockImplementation(async (key) => {
      if (key === 'unlocked') return unlockedFlag;
      return undefined as never;
    });
    vi.mocked(sessionStore.set).mockImplementation(async (key, value) => {
      if (key === 'unlocked') unlockedFlag = value as boolean;
    });

    const res = await handleGetLockState();

    expect(res.success).toBe(true);
    if (res.success) expect(res.data.unlocked).toBe(false);
    expect(getCachedPrivateKey()).toBeNull();
  });
});
