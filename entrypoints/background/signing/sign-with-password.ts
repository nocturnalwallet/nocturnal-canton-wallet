import {
  signTransactionHash,
  signMessage,
  getPublicKeyFromPrivate,
} from '@canton-network/core-signing-lib';
import { localStore } from '@lib/storage';
import { getEncryptionProvider } from '../encryption';

async function decrypt(password: string): Promise<string> {
  const keystore = await localStore.get('keystore');
  if (!keystore) throw new Error('No keystore found');
  const provider = await getEncryptionProvider();
  return provider.decryptKey(keystore, password);
}

/** Fingerprint = hex(0x1220 || SHA256(int32_be(12) || raw_pubkey_bytes)). */
export async function verifyKeyFingerprint(
  publicKeyBase64: string,
  partyId: string,
): Promise<void> {
  const raw = atob(publicKeyBase64);
  const pub = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) pub[i] = raw.charCodeAt(i);
  const prefixed = new Uint8Array(4 + pub.length);
  prefixed.set([0x00, 0x00, 0x00, 0x0c], 0);
  prefixed.set(pub, 4);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', prefixed));
  const fingerprint =
    '1220' + Array.from(digest).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (partyId.split('::')[1] !== fingerprint) {
    throw new Error('Key fingerprint mismatch — your signing key does not match your party ID.');
  }
}

/**
 * Derive the public key from a raw private key, verify the key fingerprint
 * against `expectedPartyId` (when provided), and sign the prepared transaction
 * hash. The single signing path shared by both the password flow (which
 * decrypts first) and the silent auto-register flow (which holds a scoped
 * RAM-only key). The key is never returned or persisted beyond this call.
 */
export async function signHashWithKey(
  privateKey: string,
  expectedPartyId: string | undefined,
  preparedTransactionHash: string,
): Promise<{ signature: string; publicKey: string }> {
  const publicKey = getPublicKeyFromPrivate(privateKey);
  if (expectedPartyId) await verifyKeyFingerprint(publicKey, expectedPartyId);
  return { signature: signTransactionHash(preparedTransactionHash, privateKey), publicKey };
}

/**
 * Decrypt the private key with the user's password, then sign via
 * {@link signHashWithKey}. The decrypted key is never returned or persisted —
 * it lives only in this call's local scope.
 */
export async function signHashWithPassword(
  password: string,
  expectedPartyId: string | undefined,
  preparedTransactionHash: string,
): Promise<{ signature: string; publicKey: string }> {
  const privateKey = await decrypt(password);
  return signHashWithKey(privateKey, expectedPartyId, preparedTransactionHash);
}

/**
 * Decrypt the private key with the user's password and sign a CIP-0103
 * canonical UTF-8 message. The decrypted key is never returned or persisted.
 */
export async function signMessageWithPassword(
  password: string,
  message: string,
): Promise<{ signature: string; publicKey: string }> {
  const privateKey = await decrypt(password);
  const publicKey = getPublicKeyFromPrivate(privateKey);
  return { signature: signMessage(message, privateKey), publicKey };
}
