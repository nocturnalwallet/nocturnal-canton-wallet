import { ok, err } from '@lib/messaging';
import type { MessageResponse } from '@lib/messaging';
import type {
  PrepareTransferResponse,
  PrepareTransferTokenStandardResponse,
  TransferSubmitResult,
} from '@lib/types';
import { sessionStore } from '@lib/storage';
import apiClient from '../api-client';
import { signHashWithPassword } from '../signing/sign-with-password';
import { resetAutoLockTimer } from './session.handler';

async function verifyCurrentParty(expectedPartyId?: string): Promise<string> {
  const currentPartyId = await sessionStore.get('partyId');
  if (!currentPartyId) throw new Error('No active session — please sign in again.');
  if (expectedPartyId && currentPartyId !== expectedPartyId) {
    throw new Error('Transaction sender does not match your account. Cannot sign.');
  }
  return currentPartyId;
}

/**
 * Decrypt the private key, derive public key, verify fingerprint, and sign the hash.
 * Returns the signature for inclusion in submit requests.
 */
async function signAndVerify(
  password: string,
  partyId: string,
  preparedTransactionHash: string,
): Promise<string> {
  const { signature } = await signHashWithPassword(password, partyId, preparedTransactionHash);
  return signature;
}

export async function handleSignAndSubmitTransferPreapproval(payload: {
  password: string;
  preparedData: PrepareTransferResponse;
}): Promise<MessageResponse<TransferSubmitResult>> {
  try {
    const { password, preparedData } = payload;
    const partyId = await verifyCurrentParty();
    const signature = await signAndVerify(
      password, partyId, preparedData.preparedTransactionHash,
    );

    const { data } = await apiClient.post('/transfer-offer/submit', {
      preparedTransaction: preparedData.preparedTransaction,
      preparedTransactionHash: preparedData.preparedTransactionHash,
      hashingSchemeVersion: preparedData.hashingSchemeVersion,
      signature,
    });

    resetAutoLockTimer();
    return ok({
      success: true,
      updateId: data?.data?.updateId as string | undefined,
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Transfer failed');
  }
}

export async function handleSignAndSubmitTransferTokenStandard(payload: {
  password: string;
  preparedData: PrepareTransferTokenStandardResponse;
}): Promise<MessageResponse<TransferSubmitResult>> {
  try {
    const { password, preparedData } = payload;
    const partyId = await verifyCurrentParty();
    const signature = await signAndVerify(
      password, partyId, preparedData.preparedTransactionHash,
    );

    const { data } = await apiClient.post('/transfer-offer/submit', {
      preparedTransaction: preparedData.preparedTransaction,
      preparedTransactionHash: preparedData.preparedTransactionHash,
      hashingSchemeVersion: preparedData.hashingSchemeVersion,
      signature,
    });

    resetAutoLockTimer();
    return ok({
      success: true,
      updateId: data?.data?.updateId as string | undefined,
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Transfer failed');
  }
}

export async function handleSignAndSubmitApprove(payload: {
  password: string;
  preparedData: PrepareTransferTokenStandardResponse;
}): Promise<MessageResponse<{ success: boolean }>> {
  try {
    const { password, preparedData } = payload;
    const partyId = await verifyCurrentParty();
    const signature = await signAndVerify(
      password, partyId, preparedData.preparedTransactionHash,
    );

    await apiClient.post('/transfer-offer/approve/submit', {
      preparedTransaction: preparedData.preparedTransaction,
      preparedTransactionHash: preparedData.preparedTransactionHash,
      hashingSchemeVersion: preparedData.hashingSchemeVersion,
      signature,
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
}): Promise<MessageResponse<{ success: boolean }>> {
  try {
    const { password, preparedData } = payload;
    const partyId = await verifyCurrentParty();
    const signature = await signAndVerify(
      password, partyId, preparedData.preparedTransactionHash,
    );

    await apiClient.post('/transfer-offer/reject/submit', {
      preparedTransaction: preparedData.preparedTransaction,
      preparedTransactionHash: preparedData.preparedTransactionHash,
      hashingSchemeVersion: preparedData.hashingSchemeVersion,
      signature,
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
}): Promise<MessageResponse<{ success: boolean }>> {
  try {
    const { password, preparedData } = payload;
    const partyId = await verifyCurrentParty();
    const signature = await signAndVerify(
      password, partyId, preparedData.preparedTransactionHash,
    );

    await apiClient.post('/transfer-offer/withdraw/submit', {
      preparedTransaction: preparedData.preparedTransaction,
      preparedTransactionHash: preparedData.preparedTransactionHash,
      hashingSchemeVersion: preparedData.hashingSchemeVersion,
      signature,
    });

    resetAutoLockTimer();
    return ok({ success: true });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Withdraw failed');
  }
}
