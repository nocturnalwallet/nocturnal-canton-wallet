import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleDeleteKeystore,
  handleGetPreapprovalStatus,
  handleResetKeystoreForRecovery,
  markPreapprovalRegistered,
} from './keystore.handler';

vi.mock('@lib/storage', () => ({
  localStore: {
    set: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
  },
  sessionStore: {
    clear: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('../api-client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('./session.handler', () => ({
  getAutoRegisterKey: vi.fn(),
  clearAutoRegisterKey: vi.fn(),
  maybeCacheAutoRegisterKey: vi.fn(),
}));
vi.mock('@canton-network/core-signing-lib', () => ({
  signTransactionHash: vi.fn(() => 'SIG'),
  getPublicKeyFromPrivate: vi.fn(() => 'PUB'),
  createKeyPair: vi.fn(),
}));
vi.mock('../encryption', () => ({
  getEncryptionProvider: vi.fn(),
}));
vi.mock('../signing/sign-with-password', () => ({
  signHashWithKey: vi.fn(async () => ({ signature: 'SIG', publicKey: 'PUB' })),
}));

import { localStore, sessionStore } from '@lib/storage';
import {
  handleMaybeAutoRegisterPreapproval,
  handleRegisterTransferPreapproval,
  clearPreapprovalCache,
} from './keystore.handler';
import apiClient from '../api-client';
import { getAutoRegisterKey, clearAutoRegisterKey } from './session.handler';
import { getEncryptionProvider } from '../encryption';
import { signHashWithKey } from '../signing/sign-with-password';

describe('handleResetKeystoreForRecovery', () => {
  beforeEach(() => {
    vi.mocked(localStore.set).mockReset();
    vi.mocked(localStore.remove).mockReset();
    vi.mocked(sessionStore.clear).mockReset();
    vi.mocked(sessionStore.get).mockReset();
    vi.mocked(apiClient.get).mockReset();
    clearPreapprovalCache();
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

  it('clears the in-memory preapproval cache', async () => {
    markPreapprovalRegistered();
    vi.mocked(sessionStore.get).mockResolvedValue(null);

    await handleResetKeystoreForRecovery();
    const status = await handleGetPreapprovalStatus();

    expect(status).toEqual({ success: true, data: { hasPreapproval: false } });
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});

describe('handleDeleteKeystore', () => {
  beforeEach(() => {
    vi.mocked(localStore.set).mockReset();
    vi.mocked(localStore.remove).mockReset();
    vi.mocked(sessionStore.clear).mockReset();
    vi.mocked(sessionStore.get).mockReset();
    vi.mocked(apiClient.get).mockReset();
    clearPreapprovalCache();
  });

  it('clears the in-memory preapproval cache', async () => {
    markPreapprovalRegistered();
    vi.mocked(sessionStore.get).mockResolvedValue(null);

    await handleDeleteKeystore();
    const status = await handleGetPreapprovalStatus();

    expect(status).toEqual({ success: true, data: { hasPreapproval: false } });
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});

describe('handleMaybeAutoRegisterPreapproval', () => {
  beforeEach(() => {
    vi.mocked(sessionStore.get).mockReset();
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(getAutoRegisterKey).mockReset();
    vi.mocked(clearAutoRegisterKey).mockReset();
    vi.mocked(signHashWithKey).mockReset();
    vi.mocked(signHashWithKey).mockResolvedValue({ signature: 'SIG', publicKey: 'PUB' });
    vi.mocked(localStore.get).mockReset();
    vi.mocked(localStore.get).mockResolvedValue(false); // durable marker off by default
    clearPreapprovalCache(); // reset the 30-min in-memory status cache between tests
  });

  it('does nothing when the rollout flag is off', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) =>
      k === 'shouldAutoRegisterPreapproval' ? false : k === 'partyId' ? 'p::1' : null);
    vi.mocked(getAutoRegisterKey).mockReturnValue('PRIV');

    const res = await handleMaybeAutoRegisterPreapproval();

    expect(res).toEqual({ success: true, data: { attempted: false, registered: false, reason: 'disabled' } });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('skips (locked) when the scoped auto-register key is not cached', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) =>
      k === 'shouldAutoRegisterPreapproval' ? true : k === 'partyId' ? 'p::1' : null);
    vi.mocked(getAutoRegisterKey).mockReturnValue(null);

    const res = await handleMaybeAutoRegisterPreapproval();

    expect(res.success && res.data.reason).toBe('locked');
    expect(res.success && res.data.attempted).toBe(false);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('skips when a preapproval already exists (idempotent) and clears the scoped key', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) =>
      k === 'shouldAutoRegisterPreapproval' ? true : k === 'partyId' ? 'p::1' : null);
    vi.mocked(getAutoRegisterKey).mockReturnValue('PRIV');
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: { exists: true } } } as any); // status

    const res = await handleMaybeAutoRegisterPreapproval();

    expect(res.success && res.data).toEqual({ attempted: false, registered: false, reason: 'already-registered' });
    expect(apiClient.post).not.toHaveBeenCalled(); // never prepared/submitted
    expect(clearAutoRegisterKey).toHaveBeenCalled();
  });

  it('registers via the scoped raw key when enabled, unlocked, and no preapproval yet', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) =>
      k === 'shouldAutoRegisterPreapproval' ? true : k === 'partyId' ? 'p::1' : null);
    vi.mocked(getAutoRegisterKey).mockReturnValue('PRIV');
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: { exists: false } } } as any); // status
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: { data: { preparedTransaction: 'TX', preparedTransactionHash: 'H', commandId: 'C' } } } as any) // prepare
      .mockResolvedValueOnce({ data: {} } as any); // submit

    const res = await handleMaybeAutoRegisterPreapproval();

    expect(res.success && res.data).toEqual({ attempted: true, registered: true });
    // Signs the prepared hash with the scoped RAW key (not a password).
    expect(vi.mocked(signHashWithKey)).toHaveBeenCalledWith('PRIV', 'p::1', 'H');
    expect(apiClient.post).toHaveBeenCalledWith('/wallet/transfer-preapproval/prepare', { partyId: 'p::1' });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/wallet/transfer-preapproval/submit',
      expect.objectContaining({ partyId: 'p::1', signature: 'SIG', commandId: 'C' }),
    );
    expect(clearAutoRegisterKey).toHaveBeenCalled(); // scoped key consumed on success
  });

  it('skips (durable) when a prior registration was recorded, without a status check', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) =>
      k === 'shouldAutoRegisterPreapproval' ? true : k === 'partyId' ? 'p::1' : null);
    vi.mocked(getAutoRegisterKey).mockReturnValue('PRIV');
    vi.mocked(localStore.get).mockResolvedValue(true); // durable marker set

    const res = await handleMaybeAutoRegisterPreapproval();

    expect(res.success && res.data).toEqual({ attempted: false, registered: false, reason: 'durable' });
    expect(apiClient.get).not.toHaveBeenCalled(); // no status check — defense-in-depth
    expect(apiClient.post).not.toHaveBeenCalled(); // no register
  });
});

describe('handleRegisterTransferPreapproval', () => {
  const decryptKey = vi.fn(async () => 'DECRYPTED_KEY');

  beforeEach(() => {
    vi.mocked(sessionStore.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(getAutoRegisterKey).mockReset();
    vi.mocked(localStore.set).mockReset();
    vi.mocked(localStore.get).mockReset();
    vi.mocked(localStore.get).mockResolvedValue({ backend: 'webcrypto' } as any); // keystore present
    decryptKey.mockClear();
    vi.mocked(getEncryptionProvider).mockResolvedValue({ decryptKey } as never);
    vi.mocked(signHashWithKey).mockReset();
    vi.mocked(signHashWithKey).mockResolvedValue({ signature: 'SIG', publicKey: 'PUB' });
    clearPreapprovalCache();
  });

  it('decrypts with the supplied password and signs the prepared hash via the raw-key path', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) => (k === 'partyId' ? 'p::1' : null));
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: { data: { preparedTransaction: 'TX', preparedTransactionHash: 'H', commandId: 'C' } } } as any) // prepare
      .mockResolvedValueOnce({ data: {} } as any); // submit

    const res = await handleRegisterTransferPreapproval('typed-pw');

    expect(decryptKey).toHaveBeenCalledWith(expect.anything(), 'typed-pw');
    expect(vi.mocked(signHashWithKey)).toHaveBeenCalledWith('DECRYPTED_KEY', 'p::1', 'H');
    expect(res.success).toBe(true);
  });

  it('does NOT consult the auto-register key — manual signing goes through the password', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) => (k === 'partyId' ? 'p::1' : null));
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: { data: { preparedTransaction: 'TX', preparedTransactionHash: 'H', commandId: 'C' } } } as any)
      .mockResolvedValueOnce({ data: {} } as any);

    await handleRegisterTransferPreapproval('typed-pw');

    expect(getAutoRegisterKey).not.toHaveBeenCalled();
  });

  it('persists the durable preapprovalRegistered marker on successful submit', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) => (k === 'partyId' ? 'p::1' : null));
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: { data: { preparedTransaction: 'TX', preparedTransactionHash: 'H', commandId: 'C' } } } as any) // prepare
      .mockResolvedValueOnce({ data: {} } as any); // submit

    const res = await handleRegisterTransferPreapproval('pw1');

    expect(res.success).toBe(true);
    expect(localStore.set).toHaveBeenCalledWith('preapprovalRegistered', true);
  });

  it('returns success and caches registration when durable marker persistence fails after submit', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) => (k === 'partyId' ? 'p::1' : null));
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: { data: { preparedTransaction: 'TX', preparedTransactionHash: 'H', commandId: 'C' } } } as any)
      .mockResolvedValueOnce({ data: {} } as any);
    vi.mocked(localStore.set).mockRejectedValueOnce(new Error('storage write failed'));

    const res = await handleRegisterTransferPreapproval('pw1');
    const status = await handleGetPreapprovalStatus();

    expect(res).toEqual({ success: true, data: { success: true } });
    expect(status).toEqual({ success: true, data: { hasPreapproval: true } });
    expect(apiClient.post).toHaveBeenCalledTimes(2);
  });
});
