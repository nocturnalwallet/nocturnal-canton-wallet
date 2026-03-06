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
async function verifyKeyFingerprint(privateKey: string, partyId: string): Promise<void> {
  const { getPublicKeyFromPrivate } = await import('@canton-network/core-signing-lib');
  const publicKeyBase64 = getPublicKeyFromPrivate(privateKey);

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

export async function handleSignAndSubmitTransferPreapproval(payload: {
  password: string;
  preparedData: PrepareTransferResponse;
}): Promise<MessageResponse<{ success: boolean }>> {
  try {
    const { password, preparedData } = payload;
    await verifyCurrentParty(preparedData.senderPartyId);
    const privateKey = await decryptKey(password);
    await verifyKeyFingerprint(privateKey, preparedData.senderPartyId);

    const { signTransactionHash } = await import(
      '@canton-network/core-signing-lib'
    );

    const signature = signTransactionHash(preparedData.preparedTransactionHash, privateKey);

    await apiClient.post('/external-party/transfer-amulet/submit', {
      preparedTransaction: preparedData.preparedTransaction,
      hashingSchemeVersion: preparedData.hashingSchemeVersion,
      signature,
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
    const privateKey = await decryptKey(password);
    await verifyKeyFingerprint(privateKey, partyId);

    const { signTransactionHash } = await import(
      '@canton-network/core-signing-lib'
    );

    const signature = signTransactionHash(
      preparedData.preparedTransactionHash,
      privateKey,
    );

    await apiClient.post('/offers/submit', {
      preparedTransaction: preparedData.preparedTransaction,
      signature,
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
    const privateKey = await decryptKey(password);
    await verifyKeyFingerprint(privateKey, partyId);

    const { signTransactionHash } = await import(
      '@canton-network/core-signing-lib'
    );
    const signature = signTransactionHash(
      preparedData.preparedTransactionHash,
      privateKey,
    );

    await apiClient.post('/offers/approve/submit', {
      preparedTransaction: preparedData.preparedTransaction,
      signature,
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
    const privateKey = await decryptKey(password);
    await verifyKeyFingerprint(privateKey, partyId);

    const { signTransactionHash } = await import(
      '@canton-network/core-signing-lib'
    );
    const signature = signTransactionHash(
      preparedData.preparedTransactionHash,
      privateKey,
    );

    await apiClient.post('/offers/reject/submit', {
      preparedTransaction: preparedData.preparedTransaction,
      signature,
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
    const privateKey = await decryptKey(password);
    await verifyKeyFingerprint(privateKey, partyId);

    const { signTransactionHash } = await import(
      '@canton-network/core-signing-lib'
    );
    const signature = signTransactionHash(
      preparedData.preparedTransactionHash,
      privateKey,
    );

    await apiClient.post('/offers/withdraw/submit', {
      preparedTransaction: preparedData.preparedTransaction,
      signature,
      contractId,
    });

    resetAutoLockTimer();
    return ok({ success: true });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Withdraw failed');
  }
}

