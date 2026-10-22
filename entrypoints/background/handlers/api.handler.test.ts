import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/storage', () => ({
  localStore: { get: vi.fn(), set: vi.fn() },
  sessionStore: { get: vi.fn() },
  getStorageScope: vi.fn(),
  ensureUserScope: vi.fn(),
}));

vi.mock('../api-client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../signing/sign-with-password', () => ({
  signHashWithPassword: vi.fn(async () => ({ signature: 'FAUCET_SIG', publicKey: 'PUB' })),
}));

import { sessionStore } from '@lib/storage';
import apiClient from '../api-client';
import { signHashWithPassword } from '../signing/sign-with-password';
import {
  handleRequestFaucet,
  handlePrepareTransferPreapproval,
  handlePrepareTransferTokenStandard,
} from './api.handler';

describe('handleRequestFaucet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sessionStore.get).mockResolvedValue('party-1');
    vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
      if (url === '/external-party/devnet-tap/prepare') {
        return {
          data: {
            data: {
              preparedTransactionHash: 'HASH123',
              preparedTransaction: 'PREPARED_TX',
            },
          },
        };
      }
      return { data: { data: {} } };
    });
  });

  it('signs the faucet tap with the typed password', async () => {
    const res = await handleRequestFaucet('typed-pw', '100');

    expect(vi.mocked(signHashWithPassword)).toHaveBeenCalledWith(
      'typed-pw',
      'party-1',
      'HASH123',
    );
    expect(res).toEqual({ success: true, data: { success: true } });
  });

  it('submits the signature and prepared transaction returned by the helper', async () => {
    await handleRequestFaucet('typed-pw', '100');

    expect(apiClient.post).toHaveBeenNthCalledWith(
      1,
      '/external-party/devnet-tap/prepare',
      { partyId: 'party-1', amount: '100' },
    );
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      '/external-party/devnet-tap/submit',
      {
        preparedTransaction: 'PREPARED_TX',
        preparedTransactionHash: 'HASH123',
        signature: 'FAUCET_SIG',
        partyId: 'party-1',
      },
    );
  });

  it('fails without ever calling the faucet prepare/submit endpoints when the password is wrong', async () => {
    vi.mocked(signHashWithPassword).mockRejectedValueOnce(
      new Error('Incorrect password'),
    );

    const res = await handleRequestFaucet('wrong-pw', '100');

    expect(res).toEqual({ success: false, error: 'Incorrect password' });
    expect(apiClient.post).toHaveBeenCalledTimes(1); // prepare only, no submit
  });

  it('returns an error when there is no party ID', async () => {
    vi.mocked(sessionStore.get).mockResolvedValue(null);

    const res = await handleRequestFaucet('typed-pw', '100');

    expect(res).toEqual({ success: false, error: 'No party ID' });
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});

// The transfer memo is an optional, PUBLIC on-chain field (`reason`). It must be
// sent only when the user typed one — never as an empty string (empty metadata
// still costs Canton traffic, billed per byte).
describe('transfer prepare — optional reason/memo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { data: { preparedTransaction: 'TX', preparedTransactionHash: 'H' } },
    } as never);
  });

  function postedBody(): Record<string, unknown> {
    return vi.mocked(apiClient.post).mock.calls[0][1] as Record<string, unknown>;
  }

  describe('handlePrepareTransferPreapproval (Amulet)', () => {
    it('includes reason when a memo is provided', async () => {
      await handlePrepareTransferPreapproval({
        receiverPartyId: 'party-x',
        amount: '1.5',
        reason: 'lunch money',
      });
      expect(postedBody()).toMatchObject({
        assetId: 'Amulet',
        assetAmount: '1.5',
        receiverPartyId: 'party-x',
        reason: 'lunch money',
      });
    });

    it('omits reason when the memo is an empty string', async () => {
      await handlePrepareTransferPreapproval({
        receiverPartyId: 'party-x',
        amount: '1.5',
        reason: '',
      });
      expect('reason' in postedBody()).toBe(false);
    });

    it('omits reason when no memo is passed', async () => {
      await handlePrepareTransferPreapproval({
        receiverPartyId: 'party-x',
        amount: '1.5',
      });
      expect('reason' in postedBody()).toBe(false);
    });
  });

  describe('handlePrepareTransferTokenStandard', () => {
    const base = {
      assetId: 'CBTC',
      assetAmount: '2',
      receiverPartyId: 'party-y',
      maxTimeToExecute: 86_400_000,
    };

    it('includes reason when a memo is provided', async () => {
      await handlePrepareTransferTokenStandard({ ...base, reason: 'invoice #42' });
      expect(postedBody()).toMatchObject({ ...base, reason: 'invoice #42' });
    });

    it('omits reason when empty, keeping the rest of the payload', async () => {
      await handlePrepareTransferTokenStandard({ ...base, reason: '' });
      const body = postedBody();
      expect('reason' in body).toBe(false);
      expect(body).toMatchObject(base);
    });
  });
});
