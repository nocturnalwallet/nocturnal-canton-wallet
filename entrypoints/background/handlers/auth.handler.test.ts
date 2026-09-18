import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@lib/storage', () => ({
  localStore: { get: vi.fn(), set: vi.fn() },
  sessionStore: { set: vi.fn(), setMany: vi.fn(), clear: vi.fn(), get: vi.fn() },
  setUserScope: vi.fn(),
  whenStorageReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api-client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('./session.handler', () => ({ clearAutoRegisterKey: vi.fn() }));
vi.mock('./keystore.handler', () => ({ clearPreapprovalCache: vi.fn() }));

// chrome global stub
(globalThis as any).chrome = {
  identity: {
    getRedirectURL: vi.fn(() => 'https://fake-extension-id.chromiumapp.org/'),
    launchWebAuthFlow: vi.fn(),
  },
  alarms: { clear: vi.fn() },
};

// crypto.randomUUID stub — predictable state so we can echo it back in the redirect URL
const FIXED_STATE = '11111111-1111-1111-1111-111111111111';
vi.spyOn(crypto, 'randomUUID').mockReturnValue(FIXED_STATE as `${string}-${string}-${string}-${string}-${string}`);

// fetch stub for Google token exchange
const fetchMock = vi.fn();
(globalThis as any).fetch = fetchMock;

import { handleGoogleAuth } from './auth.handler';
import apiClient from '../api-client';
import { localStore, sessionStore } from '@lib/storage';

// ── Constants ──
const PK_BACKEND = 'E8EiDJyl6LIO4OHpGwBd4s3e8hfcqCjQ++4h2lwWsDo=';
const PK_LOCAL_DIFFERENT = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

/** Full valid keystore shape matching KeystoreData schema */
function makeKeystore(walletKey: string) {
  return {
    cantonKey: 'canton-key',
    walletKey,
    hashedKey: 'hashed-key',
    backend: 'webcrypto' as const,
    version: 1,
  };
}

/** Legacy keystore shape without walletKey */
const legacyKeystore = {
  cantonKey: 'canton-key',
  walletKey: undefined as unknown as string,
  hashedKey: 'hashed-key',
  backend: 'webcrypto' as const,
  version: 1,
};

// ── Helpers ──
function mockAuthMe(
  party: { partyId: string; publicKey: string; onboardingStatus: string } | null,
  shouldAutoRegisterPreapproval?: boolean,
) {
  vi.mocked(apiClient.get).mockResolvedValue({
    data: { data: { party, shouldAutoRegisterPreapproval } },
  } as any);
}

// ── Console spy ──
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

// ── Shared OAuth setup ──
beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
  vi.stubEnv('VITE_GOOGLE_CLIENT_SECRET', 'test-client-secret');

  // launchWebAuthFlow resolves with matching state + code
  (chrome.identity.launchWebAuthFlow as any).mockResolvedValue(
    `https://fake-extension-id.chromiumapp.org/?code=test-code&state=${FIXED_STATE}`,
  );

  // fetch → token exchange
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ id_token: 'fake-id-token' }),
  });

  // apiClient.post → /auth/login-with-google
  vi.mocked(apiClient.post).mockResolvedValue({
    data: { data: { token: 'tok', refreshToken: 'rtok', user: { id: 'u1', email: 'x@y' } } },
  } as any);

  consoleWarnSpy.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── Tests ──
describe('handleGoogleAuth — keystore mismatch detection', () => {
  it('returns keyMismatch: true when keystore.walletKey !== party.publicKey AND party is SUCCESSFULLY', async () => {
    mockAuthMe({ partyId: 'p1', publicKey: PK_BACKEND, onboardingStatus: 'SUCCESSFULLY' });
    vi.mocked(localStore.get).mockImplementation(async (key) => {
      if (key === 'keystore') return makeKeystore(PK_LOCAL_DIFFERENT) as any;
      if (key === 'onboardingComplete') return true;
      return null;
    });

    const result = await handleGoogleAuth();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyMismatch).toBe(true);
    }
  });

  it('returns keyMismatch: false when keystore.walletKey === party.publicKey', async () => {
    mockAuthMe({ partyId: 'p1', publicKey: PK_BACKEND, onboardingStatus: 'SUCCESSFULLY' });
    vi.mocked(localStore.get).mockImplementation(async (key) => {
      if (key === 'keystore') return makeKeystore(PK_BACKEND) as any;
      if (key === 'onboardingComplete') return true;
      return null;
    });

    const result = await handleGoogleAuth();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyMismatch).toBe(false);
    }
  });

  it('returns keyMismatch: false when no keystore exists locally', async () => {
    mockAuthMe({ partyId: 'p1', publicKey: PK_BACKEND, onboardingStatus: 'SUCCESSFULLY' });
    vi.mocked(localStore.get).mockImplementation(async (key) => {
      if (key === 'keystore') return null;
      if (key === 'onboardingComplete') return true;
      return null;
    });

    const result = await handleGoogleAuth();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyMismatch).toBe(false);
    }
  });

  it('returns keyMismatch: false when party.onboardingStatus is PENDING', async () => {
    mockAuthMe({ partyId: 'p1', publicKey: PK_BACKEND, onboardingStatus: 'PENDING' });
    vi.mocked(localStore.get).mockImplementation(async (key) => {
      if (key === 'keystore') return makeKeystore(PK_LOCAL_DIFFERENT) as any;
      if (key === 'onboardingComplete') return false;
      return null;
    });

    const result = await handleGoogleAuth();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyMismatch).toBe(false);
    }
  });

  it('returns keyMismatch: false when party.publicKey is empty string', async () => {
    mockAuthMe({ partyId: 'p1', publicKey: '', onboardingStatus: 'SUCCESSFULLY' });
    vi.mocked(localStore.get).mockImplementation(async (key) => {
      if (key === 'keystore') return makeKeystore(PK_LOCAL_DIFFERENT) as any;
      if (key === 'onboardingComplete') return true;
      return null;
    });

    const result = await handleGoogleAuth();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyMismatch).toBe(false);
    }
  });

  it('returns keyMismatch: false when /auth/me returns party: null', async () => {
    mockAuthMe(null);
    vi.mocked(localStore.get).mockImplementation(async (key) => {
      if (key === 'keystore') return makeKeystore(PK_LOCAL_DIFFERENT) as any;
      if (key === 'onboardingComplete') return false;
      return null;
    });

    const result = await handleGoogleAuth();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyMismatch).toBe(false);
    }
  });

  it('returns keyMismatch: false when existingKeystore.walletKey is undefined (legacy shape)', async () => {
    mockAuthMe({ partyId: 'p1', publicKey: PK_BACKEND, onboardingStatus: 'SUCCESSFULLY' });
    vi.mocked(localStore.get).mockImplementation(async (key) => {
      // legacy keystore has no walletKey field
      if (key === 'keystore') return legacyKeystore as any;
      if (key === 'onboardingComplete') return true;
      return null;
    });

    const result = await handleGoogleAuth();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyMismatch).toBe(false);
    }
  });

  it('emits console.warn with truncated keys when mismatch detected', async () => {
    mockAuthMe({ partyId: 'p1', publicKey: PK_BACKEND, onboardingStatus: 'SUCCESSFULLY' });
    vi.mocked(localStore.get).mockImplementation(async (key) => {
      if (key === 'keystore') return makeKeystore(PK_LOCAL_DIFFERENT) as any;
      if (key === 'onboardingComplete') return true;
      return null;
    });

    await handleGoogleAuth();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Keystore mismatch detected'),
      expect.objectContaining({
        expected: expect.stringMatching(/^.{1,16}…$/),
        actual: expect.stringMatching(/^.{1,16}…$/),
      }),
    );
  });

  it('does not throw when localStore.get throws — falls back to keyMismatch: false', async () => {
    mockAuthMe({ partyId: 'p1', publicKey: PK_BACKEND, onboardingStatus: 'SUCCESSFULLY' });
    vi.mocked(localStore.get).mockImplementation(async (key) => {
      if (key === 'onboardingComplete') return true;
      if (key === 'keystore') throw new Error('storage corrupted');
      return null;
    });

    const result = await handleGoogleAuth();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyMismatch).toBe(false);
    }
  });
});

describe('handleGoogleAuth — shouldAutoRegisterPreapproval', () => {
  it('persists and returns shouldAutoRegisterPreapproval from /auth/me', async () => {
    mockAuthMe({ partyId: 'p::1', publicKey: PK_BACKEND, onboardingStatus: 'SUCCESSFULLY' }, true);
    vi.mocked(localStore.get).mockImplementation(async (key) => {
      if (key === 'keystore') return null;
      if (key === 'onboardingComplete') return true;
      return null;
    });

    const result = await handleGoogleAuth();

    expect(sessionStore.set).toHaveBeenCalledWith('shouldAutoRegisterPreapproval', true);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.shouldAutoRegisterPreapproval).toBe(true);
  });

  it('captures the flag on first login even when party is null', async () => {
    mockAuthMe(null, true);

    const result = await handleGoogleAuth();

    expect(sessionStore.set).toHaveBeenCalledWith('shouldAutoRegisterPreapproval', true);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.shouldAutoRegisterPreapproval).toBe(true);
  });
});
