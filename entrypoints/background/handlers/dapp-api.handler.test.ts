import { describe, it, expect, vi, beforeEach } from 'vitest';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import { createKeyPair } from '@canton-network/core-signing-lib';

// Stub chrome.* so the handler module can import without exploding under Node.
(globalThis as { chrome?: unknown }).chrome = {
  runtime: { id: 'test-extension', getURL: (p: string) => `chrome-extension://test/${p}` },
  alarms: { clear: vi.fn(), create: vi.fn(), onAlarm: { addListener: vi.fn() } },
};

vi.mock('@lib/storage', () => ({
  sessionStore: { get: vi.fn(), set: vi.fn(), setMany: vi.fn(), clear: vi.fn() },
  localStore: { get: vi.fn(), set: vi.fn() },
  networkStore: { get: vi.fn(async () => 'localnet'), set: vi.fn() },
}));

vi.mock('@lib/network', () => ({
  NETWORKS: {
    localnet: {
      id: 'localnet',
      label: 'Localnet',
      apiBaseUrl: 'http://localhost:3003/',
      explorerUrl: '',
      faucetEnabled: true,
    },
  },
}));

vi.mock('../gateway-facade-client', () => ({
  gatewayFacadeDappRpc: vi.fn(),
  gatewayFacadeUserRpc: vi.fn(),
  getGatewayFacadeBaseUrl: vi.fn(() => 'http://localhost:3003'),
  FacadeAuthRequiredError: class extends Error {},
  FacadeNetworkError: class extends Error {},
  FacadeRpcError: class extends Error {},
}));

vi.mock('./approval.handler', () => ({
  APPROVAL_REQUIRED_METHODS: new Set<string>(),
  requestApproval: vi.fn(),
}));

vi.mock('./session.handler', () => ({
  getCachedPrivateKey: vi.fn(),
  resetAutoLockTimer: vi.fn(),
}));

import { sessionStore, localStore } from '@lib/storage';
import { getCachedPrivateKey } from './session.handler';
import { handleDappApiRequest } from './dapp-api.handler';
import { WalletEvent } from '@lib/dapp-api/types';
import type { SpliceMessage } from '@lib/dapp-api/types';

const TEST_PARTY_ID = 'kairo-devnet::1220275036adde8e3f237f4fbb4e455e606a840aa60f03f2859376824155cb04b30d';

function dappReq(method: string, params: unknown): SpliceMessage {
  return {
    type: WalletEvent.SPLICE_WALLET_REQUEST,
    request: { jsonrpc: '2.0' as const, id: 1, method, params },
  };
}

function unwrapResult<T>(res: SpliceMessage): T {
  if (res.type !== WalletEvent.SPLICE_WALLET_RESPONSE) {
    throw new Error(`Expected SPLICE_WALLET_RESPONSE, got ${res.type}`);
  }
  if ('error' in res.response) {
    throw new Error(`Expected success, got error: ${JSON.stringify(res.response.error)}`);
  }
  return res.response.result as T;
}

function unwrapError(res: SpliceMessage): { code: number; message: string } {
  if (res.type !== WalletEvent.SPLICE_WALLET_RESPONSE) {
    throw new Error(`Expected SPLICE_WALLET_RESPONSE, got ${res.type}`);
  }
  if (!('error' in res.response)) {
    throw new Error(`Expected error, got success: ${JSON.stringify(res.response.result)}`);
  }
  return res.response.error;
}

function setupUnlockedWallet(publicKey: string, privateKey: string) {
  vi.mocked(getCachedPrivateKey).mockReturnValue(privateKey);
  vi.mocked(sessionStore.get).mockImplementation(async (key: string) => {
    if (key === 'partyId') return TEST_PARTY_ID;
    if (key === 'partyStatus') return 'SUCCESSFULLY';
    if (key === 'unlocked') return true;
    if (key === 'authToken') return 'test-token';
    return null;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(localStore.get).mockImplementation((async (key: string) => {
    if (key === 'keystore') {
      return { walletKey: publicKey, cantonKey: '', hashedKey: '', backend: 'webcrypto', version: 1 };
    }
    if (key === 'onboardingComplete') return true;
    if (key === 'currentNetwork') return 'localnet';
    return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any);
}

describe('handleSignMessage — Ed25519 signature over UTF-8(message)', () => {
  const { publicKey, privateKey } = createKeyPair();

  beforeEach(() => {
    setupUnlockedWallet(publicKey, privateKey);
  });

  it('produces a signature that nacl.sign.detached.verify accepts against UTF-8(message) and publicKey', async () => {
    const message = 'Hello from Canton Test dApp!';
    const res = await handleDappApiRequest(dappReq('signMessage', { message }));
    const result = unwrapResult<{ signature: string }>(res);

    // CIP-0103 mandates { signature } only — no publicKey/fingerprint extras.
    expect(Object.keys(result).sort()).toEqual(['signature']);

    // dApps verify with a publicKey sourced separately (e.g., getPrimaryAccount).
    const verified = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      naclUtil.decodeBase64(result.signature),
      naclUtil.decodeBase64(publicKey),
    );
    expect(verified).toBe(true);
  });

  it('produces different signatures for different messages but both verify', async () => {
    const m1 = 'message-A';
    const m2 = 'message-B';
    const sig1 = unwrapResult<{ signature: string }>(await handleDappApiRequest(dappReq('signMessage', { message: m1 }))).signature;
    const sig2 = unwrapResult<{ signature: string }>(await handleDappApiRequest(dappReq('signMessage', { message: m2 }))).signature;
    expect(sig1).not.toBe(sig2);

    const pkBytes = naclUtil.decodeBase64(publicKey);
    expect(nacl.sign.detached.verify(new TextEncoder().encode(m1), naclUtil.decodeBase64(sig1), pkBytes)).toBe(true);
    expect(nacl.sign.detached.verify(new TextEncoder().encode(m2), naclUtil.decodeBase64(sig2), pkBytes)).toBe(true);
  });

  it('rejects missing or non-string message parameter', async () => {
    expect(unwrapError(await handleDappApiRequest(dappReq('signMessage', {}))).message).toMatch(/message/i);
    expect(unwrapError(await handleDappApiRequest(dappReq('signMessage', { message: 123 }))).message).toMatch(/message/i);
  });
});

describe('handleSignTransaction — input validation', () => {
  const { publicKey, privateKey } = createKeyPair();

  beforeEach(() => {
    setupUnlockedWallet(publicKey, privateKey);
  });

  it('rejects a transactionHash that contains hex-only chars (likely hex, not base64)', async () => {
    // 64-char lowercase hex looks valid to a naive base64 decoder but is almost
    // certainly NOT what the caller meant. Surfacing it loudly prevents the
    // silent-garbage-signing bug that affected handleSignMessage.
    const hexLooking = 'a'.repeat(64);
    const err = unwrapError(await handleDappApiRequest(dappReq('signTransaction', { transactionHash: hexLooking })));
    expect(err.message).toMatch(/base64/i);
    // CIP-0103 INVALID_PARAMS, not the catch-all INTERNAL_ERROR.
    expect(err.code).toBe(-32602);
  });

  it('accepts a valid base64-encoded 32-byte hash and produces a verifiable signature over those raw bytes', async () => {
    const hashBytes = new Uint8Array(32);
    crypto.getRandomValues(hashBytes);
    const hashB64 = naclUtil.encodeBase64(hashBytes);
    const { signature } = unwrapResult<{ signature: string }>(
      await handleDappApiRequest(dappReq('signTransaction', { transactionHash: hashB64 })),
    );
    expect(signature).toBeTruthy();
    const ok = nacl.sign.detached.verify(
      hashBytes,
      naclUtil.decodeBase64(signature),
      naclUtil.decodeBase64(publicKey),
    );
    expect(ok).toBe(true);
  });
});

describe('handleStatus — CIP-0103 StatusEvent shape', () => {
  const { publicKey, privateKey } = createKeyPair();

  beforeEach(() => {
    setupUnlockedWallet(publicKey, privateKey);
    // setupUnlockedWallet already provides authToken via sessionStore mock.
    // Add user.id via localStore mock so session emission has all required fields.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(localStore.get).mockImplementation((async (key: string) => {
      if (key === 'keystore') {
        return { walletKey: publicKey, cantonKey: '', hashedKey: '', backend: 'webcrypto', version: 1 };
      }
      if (key === 'onboardingComplete') return true;
      if (key === 'currentNetwork') return 'localnet';
      if (key === 'user') return { id: 'test-user-id', email: 'x@y', firstName: 'X', lastName: 'Y', isActive: true };
      return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
  });

  it('connection has all required ConnectResult fields per openrpc-dapp-api.json:712-741', async () => {
    const res = await handleDappApiRequest(dappReq('status', {}));
    const status = unwrapResult<{ connection: Record<string, unknown> }>(res);
    // Spec required: isConnected, isNetworkConnected. Both must be booleans.
    expect(typeof status.connection.isConnected).toBe('boolean');
    expect(typeof status.connection.isNetworkConnected).toBe('boolean');
    // Spec optional but Ginkgo always emits: reason, networkReason.
    expect(typeof status.connection.reason).toBe('string');
    expect(typeof status.connection.networkReason).toBe('string');
  });

  it('session has spec shape { accessToken, userId } per openrpc-dapp-api.json:819-834 (additionalProperties: false)', async () => {
    const res = await handleDappApiRequest(dappReq('status', {}));
    const status = unwrapResult<{ session?: Record<string, unknown> }>(res);
    expect(status.session).toBeDefined();
    expect(Object.keys(status.session!).sort()).toEqual(['accessToken', 'userId']);
    expect(status.session!.accessToken).toBe('test-token');
    expect(status.session!.userId).toBe('test-user-id');
  });

  it('omits session entirely when authToken is absent', async () => {
    vi.mocked(sessionStore.get).mockImplementation(async (key: string) => {
      if (key === 'partyId') return TEST_PARTY_ID;
      if (key === 'unlocked') return true;
      if (key === 'partyStatus') return 'SUCCESSFULLY';
      // authToken returns null → no Google session → omit session field
      return null;
    });
    const res = await handleDappApiRequest(dappReq('status', {}));
    const status = unwrapResult<{ session?: Record<string, unknown> }>(res);
    expect(status.session).toBeUndefined();
  });
});
