import { signTransactionHash, getPublicKeyFromPrivate } from '@canton-network/core-signing-lib';
import { ok, err } from '@lib/messaging';
import type { MessageResponse } from '@lib/messaging';
import type {
  PrepareTransferResponse,
  PrepareTransferTokenStandardResponse,
} from '@lib/types';
import { localStore, sessionStore } from '@lib/storage';
import { getEncryptionProvider } from '../encryption';
import apiClient from '../api-client';
import { resetAutoLockTimer } from './session.handler';

async function decryptKey(password: string): Promise<string> {
  const keystore = await localStore.get('keystore');
  if (!keystore) throw new Error('No keystore found');

  const provider = await getEncryptionProvider();
  return provider.decryptKey(keystore, password);
}

async function verifyCurrentParty(expectedPartyId?: string): Promise<string> {
  const currentPartyId = await sessionStore.get('partyId');
  if (!currentPartyId) throw new Error('No active session — please sign in again.');
  if (expectedPartyId && currentPartyId !== expectedPartyId) {
    throw new Error('Transaction sender does not match your account. Cannot sign.');
  }
  return currentPartyId;
}

/**
 * Compute Canton fingerprint from a base64 public key and verify it matches
 * the fingerprint embedded in the partyId (format: hint::fingerprint).
 *
 * Fingerprint = hex(0x1220 || SHA256(int32_be(12) || raw_pubkey_bytes))
 */
async function verifyKeyFingerprint(publicKeyBase64: string, partyId: string): Promise<void> {
  // Decode base64 public key to raw bytes
  const raw = atob(publicKeyBase64);
  const pubKeyBytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    pubKeyBytes[i] = raw.charCodeAt(i);
  }

  // Prepend int32_be(12) = [0x00, 0x00, 0x00, 0x0c]
  const prefixed = new Uint8Array(4 + pubKeyBytes.length);
  prefixed[0] = 0x00;
  prefixed[1] = 0x00;
  prefixed[2] = 0x00;
  prefixed[3] = 0x0c;
  prefixed.set(pubKeyBytes, 4);

  // SHA-256 hash
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', prefixed));

  // Prepend 0x1220 and hex-encode
  const fingerprint =
    '1220' +
    Array.from(digest)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  const expectedFingerprint = partyId.split('::')[1];
  if (!expectedFingerprint || fingerprint !== expectedFingerprint) {
    throw new Error(
      'Key fingerprint mismatch — your signing key does not match your party ID.',
    );
  }
}

/**
 * Decrypt the private key, derive public key, verify fingerprint, and sign the hash.
 * Returns { signature, publicKey } for inclusion in submit requests.
 */
async function signAndVerify(
  password: string,
  partyId: string,
  preparedTransactionHash: string,
): Promise<{ signature: string; publicKey: string }> {
  const privateKey = await decryptKey(password);
  const publicKey = getPublicKeyFromPrivate(privateKey);
  await verifyKeyFingerprint(publicKey, partyId);
  const signature = signTransactionHash(preparedTransactionHash, privateKey);
  return { signature, publicKey };
}

export async function handleSignAndSubmitTransferPreapproval(payload: {
  password: string;
  preparedData: PrepareTransferResponse;
}): Promise<MessageResponse<{ success: boolean }>> {
  try {
    const { password, preparedData } = payload;
    const partyId = await verifyCurrentParty(preparedData.senderPartyId);
    const { signature, publicKey } = await signAndVerify(
      password, partyId, preparedData.preparedTransactionHash,
    );

    await apiClient.post('/external-party/transfer-amulet/submit', {
      preparedTransaction: preparedData.preparedTransaction,
      preparedTransactionHash: preparedData.preparedTransactionHash,
      hashingSchemeVersion: preparedData.hashingSchemeVersion,
      signature,
      publicKey,
      senderPartyId: preparedData.senderPartyId,
      receiverPartyId: preparedData.receiverPartyId,
      amount: preparedData.amount,
    });

    resetAutoLockTimer();
    return ok({ success: true });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Transfer failed');
  }
}

export async function handleSignAndSubmitTransferTokenStandard(payload: {
  password: string;
  preparedData: PrepareTransferTokenStandardResponse;
}): Promise<MessageResponse<{ success: boolean }>> {
  try {
    const { password, preparedData } = payload;
    const partyId = await verifyCurrentParty();
    const { signature, publicKey } = await signAndVerify(
      password, partyId, preparedData.preparedTransactionHash,
    );

    await apiClient.post('/offers/submit', {
      preparedTransaction: preparedData.preparedTransaction,
      preparedTransactionHash: preparedData.preparedTransactionHash,
      signature,
      publicKey,
    });

    resetAutoLockTimer();
    return ok({ success: true });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Transfer failed');
  }
}

export async function handleSignAndSubmitApprove(payload: {
  password: string;
  preparedData: PrepareTransferTokenStandardResponse;
  contractId?: string;
}): Promise<MessageResponse<{ success: boolean }>> {
  try {
    const { password, preparedData, contractId } = payload;
    const partyId = await verifyCurrentParty();
    const { signature, publicKey } = await signAndVerify(
      password, partyId, preparedData.preparedTransactionHash,
    );

    await apiClient.post('/offers/approve/submit', {
      preparedTransaction: preparedData.preparedTransaction,
      preparedTransactionHash: preparedData.preparedTransactionHash,
      signature,
      publicKey,
      contractId,
    });

    resetAutoLockTimer();
    return ok({ success: true });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Approve failed');
  }
}

export async function handleSignAndSubmitReject(payload: {
  password: string;
  preparedData: PrepareTransferTokenStandardResponse;
  contractId?: string;
}): Promise<MessageResponse<{ success: boolean }>> {
  try {
    const { password, preparedData, contractId } = payload;
    const partyId = await verifyCurrentParty();
    const { signature, publicKey } = await signAndVerify(
      password, partyId, preparedData.preparedTransactionHash,
    );

    await apiClient.post('/offers/reject/submit', {
      preparedTransaction: preparedData.preparedTransaction,
      preparedTransactionHash: preparedData.preparedTransactionHash,
      signature,
      publicKey,
      contractId,
    });

    resetAutoLockTimer();
    return ok({ success: true });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Reject failed');
  }
}

export async function handleSignAndSubmitWithdraw(payload: {
  password: string;
  preparedData: PrepareTransferTokenStandardResponse;
  contractId?: string;
}): Promise<MessageResponse<{ success: boolean }>> {
  try {
    const { password, preparedData, contractId } = payload;
    const partyId = await verifyCurrentParty();
    const { signature, publicKey } = await signAndVerify(
      password, partyId, preparedData.preparedTransactionHash,
    );

    await apiClient.post('/offers/withdraw/submit', {
      preparedTransaction: preparedData.preparedTransaction,
      preparedTransactionHash: preparedData.preparedTransactionHash,
      signature,
      publicKey,
      contractId,
    });

    resetAutoLockTimer();
    return ok({ success: true });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Withdraw failed');
  }
}
