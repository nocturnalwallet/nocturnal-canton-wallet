import { it, expect, vi, beforeEach } from 'vitest';
import { createKeyPair, signTransactionHash } from '@canton-network/core-signing-lib';

vi.mock('@lib/storage', () => ({
  localStore: { get: vi.fn() },
}));
vi.mock('../encryption', () => ({
  getEncryptionProvider: vi.fn(),
}));

import { localStore } from '@lib/storage';
import { getEncryptionProvider } from '../encryption';
import { signHashWithPassword, signHashWithKey } from './sign-with-password';

const kp = createKeyPair(); // { privateKey, publicKey } base64

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(localStore.get).mockResolvedValue({
    cantonKey: 'enc', walletKey: kp.publicKey, hashedKey: 'h', backend: 'webcrypto', version: 1,
  });
  vi.mocked(getEncryptionProvider).mockResolvedValue({
    encryptKey: vi.fn(),
    verifyPassword: vi.fn(async () => true),
    decryptKey: vi.fn(async () => kp.privateKey),
  } as never);
});

it('signs a hash with the decrypted key (fingerprint check skipped when partyId undefined)', async () => {
  const hash = btoa('hello-hash');
  const res = await signHashWithPassword('pw', undefined, hash);
  expect(res.signature).toBe(signTransactionHash(hash, kp.privateKey));
  expect(res.publicKey).toBe(kp.publicKey);
});

it('throws when no keystore is present', async () => {
  vi.mocked(localStore.get).mockResolvedValue(undefined as never);
  await expect(signHashWithPassword('pw', undefined, btoa('x'))).rejects.toThrow('No keystore found');
});

it('throws on a partyId whose fingerprint does not match the key', async () => {
  const bogus = 'hint::1220deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  await expect(signHashWithPassword('pw', bogus, btoa('x'))).rejects.toThrow(/fingerprint/i);
});

it('signHashWithKey signs with a raw key without decrypting (partyId undefined)', async () => {
  const hash = btoa('raw-key-hash');
  const res = await signHashWithKey(kp.privateKey, undefined, hash);
  expect(res.signature).toBe(signTransactionHash(hash, kp.privateKey));
  expect(res.publicKey).toBe(kp.publicKey);
  // Raw-key path must never touch the keystore/encryption provider.
  expect(localStore.get).not.toHaveBeenCalled();
  expect(getEncryptionProvider).not.toHaveBeenCalled();
});

it('signHashWithKey throws on a partyId whose fingerprint does not match the raw key', async () => {
  const bogus = 'hint::1220deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  await expect(signHashWithKey(kp.privateKey, bogus, btoa('x'))).rejects.toThrow(/fingerprint/i);
});
