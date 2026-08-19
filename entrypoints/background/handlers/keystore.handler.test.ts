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

vi.mock('../api-client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('./session.handler', () => ({ getCachedPrivateKey: vi.fn(), setCachedPrivateKey: vi.fn() }));
vi.mock('@canton-network/core-signing-lib', () => ({
  signTransactionHash: vi.fn(() => 'SIG'),
  getPublicKeyFromPrivate: vi.fn(() => 'PUB'),
  createKeyPair: vi.fn(),
}));

import { localStore, sessionStore } from '@lib/storage';
import {
  handleMaybeAutoRegisterPreapproval,
  handleRegisterTransferPreapproval,
  clearPreapprovalCache,
} from './keystore.handler';
import apiClient from '../api-client';
import { getCachedPrivateKey } from './session.handler';

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

describe('handleMaybeAutoRegisterPreapproval', () => {
  beforeEach(() => {
    vi.mocked(sessionStore.get).mockReset();
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(getCachedPrivateKey).mockReset();
    vi.mocked(localStore.get).mockReset();
    vi.mocked(localStore.get).mockResolvedValue(false); // durable marker off by default
    clearPreapprovalCache(); // reset the 30-min in-memory status cache between tests
  });

  it('does nothing when the rollout flag is off', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) =>
      k === 'shouldAutoRegisterPreapproval' ? false : k === 'partyId' ? 'p::1' : null);
    vi.mocked(getCachedPrivateKey).mockReturnValue('PRIV');

    const res = await handleMaybeAutoRegisterPreapproval();

    expect(res).toEqual({ success: true, data: { attempted: false, registered: false, reason: 'disabled' } });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('skips (locked) when the private key is not cached', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) =>
      k === 'shouldAutoRegisterPreapproval' ? true : k === 'partyId' ? 'p::1' : null);
    vi.mocked(getCachedPrivateKey).mockReturnValue(null);

    const res = await handleMaybeAutoRegisterPreapproval();

    expect(res.success && res.data.reason).toBe('locked');
    expect(res.success && res.data.attempted).toBe(false);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('skips when a preapproval already exists (idempotent)', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) =>
      k === 'shouldAutoRegisterPreapproval' ? true : k === 'partyId' ? 'p::1' : null);
    vi.mocked(getCachedPrivateKey).mockReturnValue('PRIV');
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: { exists: true } } } as any); // status

    const res = await handleMaybeAutoRegisterPreapproval();

    expect(res.success && res.data).toEqual({ attempted: false, registered: false, reason: 'already-registered' });
    expect(apiClient.post).not.toHaveBeenCalled(); // never prepared/submitted
  });

  it('registers when enabled, unlocked, and no preapproval yet', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) =>
      k === 'shouldAutoRegisterPreapproval' ? true : k === 'partyId' ? 'p::1' : null);
    vi.mocked(getCachedPrivateKey).mockReturnValue('PRIV');
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: { exists: false } } } as any); // status
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: { data: { preparedTransaction: 'TX', preparedTransactionHash: 'H', commandId: 'C' } } } as any) // prepare
      .mockResolvedValueOnce({ data: {} } as any); // submit

    const res = await handleMaybeAutoRegisterPreapproval();

    expect(res.success && res.data).toEqual({ attempted: true, registered: true });
    expect(apiClient.post).toHaveBeenCalledWith('/wallet/transfer-preapproval/prepare', { partyId: 'p::1' });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/wallet/transfer-preapproval/submit',
      expect.objectContaining({ partyId: 'p::1', signature: 'SIG', commandId: 'C' }),
    );
  });

  it('skips (durable) when a prior registration was recorded, without a status check', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) =>
      k === 'shouldAutoRegisterPreapproval' ? true : k === 'partyId' ? 'p::1' : null);
    vi.mocked(getCachedPrivateKey).mockReturnValue('PRIV');
    vi.mocked(localStore.get).mockResolvedValue(true); // durable marker set

    const res = await handleMaybeAutoRegisterPreapproval();

    expect(res.success && res.data).toEqual({ attempted: false, registered: false, reason: 'durable' });
    expect(apiClient.get).not.toHaveBeenCalled(); // no status check — defense-in-depth
    expect(apiClient.post).not.toHaveBeenCalled(); // no register
  });
});

describe('handleRegisterTransferPreapproval', () => {
  beforeEach(() => {
    vi.mocked(sessionStore.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(getCachedPrivateKey).mockReset();
    vi.mocked(localStore.set).mockReset();
    clearPreapprovalCache();
  });

  it('persists the durable preapprovalRegistered marker on successful submit', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (k: any) => (k === 'partyId' ? 'p::1' : null));
    vi.mocked(getCachedPrivateKey).mockReturnValue('PRIV');
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: { data: { preparedTransaction: 'TX', preparedTransactionHash: 'H', commandId: 'C' } } } as any) // prepare
      .mockResolvedValueOnce({ data: {} } as any); // submit

    const res = await handleRegisterTransferPreapproval();

    expect(res.success).toBe(true);
    expect(localStore.set).toHaveBeenCalledWith('preapprovalRegistered', true);
  });
});
