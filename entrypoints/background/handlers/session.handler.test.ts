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
import { handleGetLockState, handleVerifyPassword } from './session.handler';

describe('handleGetLockState', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports the stored unlocked flag without side effects (survives SW restart)', async () => {
    vi.mocked(sessionStore.get).mockResolvedValue(true); // unlocked persisted, RAM key gone
    const res = await handleGetLockState();
    expect(res.success && res.data.unlocked).toBe(true);
    expect(sessionStore.set).not.toHaveBeenCalled(); // no forced re-lock
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
