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

import { sessionStore, localStore } from '@lib/storage';
import { getEncryptionProvider } from '../encryption';
import {
  setCachedPrivateKey,
  getCachedPrivateKey,
  reconcileUnlockState,
  handleGetLockState,
  handleVerifyPassword,
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

describe('handleVerifyPassword', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns valid:true for a correct password without touching session state', async () => {
    vi.mocked(localStore.get).mockResolvedValue({ backend: 'webcrypto' } as never);
    vi.mocked(getEncryptionProvider).mockResolvedValue({ verifyPassword: vi.fn(async () => true) } as never);
    const res = await handleVerifyPassword('pw');
    expect(res.success && res.data.valid).toBe(true);
    expect(sessionStore.set).not.toHaveBeenCalled();
  });

  it('returns valid:false for a wrong password', async () => {
    vi.mocked(localStore.get).mockResolvedValue({ backend: 'webcrypto' } as never);
    vi.mocked(getEncryptionProvider).mockResolvedValue({ verifyPassword: vi.fn(async () => false) } as never);
    const res = await handleVerifyPassword('bad');
    expect(res.success && res.data.valid).toBe(false);
  });

  it('returns valid:false when no keystore exists', async () => {
    vi.mocked(localStore.get).mockResolvedValue(undefined as never);
    const res = await handleVerifyPassword('pw');
    expect(res.success && res.data.valid).toBe(false);
  });
});
