import { signTransactionHash, getPublicKeyFromPrivate } from '@canton-network/core-signing-lib';
import { ok, err } from '@lib/messaging';
import type {
  MessageResponse,
  BalancesData,
  PaginatedOffersData,
  PaginatedActivityData,
  AboutMeData,
  PrepareData,
} from '@lib/messaging';
import type {
  PrepareTransferProps,
  PrepareTransferTokenStandardProps,
  GetIncomingRequestsQuery,
  GetHistoryRequestsQuery,
} from '@lib/types';
import { localStore, sessionStore } from '@lib/storage';
import apiClient from '../api-client';
import { getCachedPrivateKey } from './session.handler';

export async function handleFetchBalances(): Promise<
  MessageResponse<BalancesData>
> {
  try {
    const partyId = await sessionStore.get('partyId');
    if (!partyId) return err('No party ID');

    const { data } = await apiClient.get('/wallet/token-balance', {
      params: { partyId },
    });
    return ok({ balances: data.data ?? [] });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Failed to fetch balances');
  }
}

export async function handlePrepareTransferPreapproval(
  payload: PrepareTransferProps,
): Promise<MessageResponse<PrepareData>> {
  try {
    const { data } = await apiClient.post(
      '/external-party/transfer-amulet/prepare',
      payload,
    );
    return ok({ preparedData: data.data });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Prepare transfer failed');
  }
}

export async function handlePrepareTransferTokenStandard(
  payload: PrepareTransferTokenStandardProps,
): Promise<MessageResponse<PrepareData>> {
  try {
    const { data } = await apiClient.post(
      '/offers/prepare',
      payload,
    );
    return ok({ preparedData: data.data });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Prepare transfer failed');
  }
}

export async function handleFetchIncomingOffers(
  payload: GetIncomingRequestsQuery,
): Promise<MessageResponse<PaginatedOffersData>> {
  try {
    const { data } = await apiClient.get(
      '/offers/incoming-requests',
      { params: payload },
    );
    const result = data.data;
    return ok({
      data: result.incomingRequestes ?? result.data ?? [],
      page: result.page,
      total: result.total,
      totalPages: result.totalPages,
      has_next: result.has_next,
      has_previous: result.has_previous,
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Failed to fetch offers');
  }
}

export async function handleFetchOutgoingOffers(
  payload: GetIncomingRequestsQuery,
): Promise<MessageResponse<PaginatedOffersData>> {
  try {
    const { data } = await apiClient.get(
      '/offers/outgoing-requests',
      { params: payload },
    );
    const result = data.data;
    return ok({
      data: result.outgoingRequestes ?? result.data ?? [],
      page: result.page,
      total: result.total,
      totalPages: result.totalPages,
      has_next: result.has_next,
      has_previous: result.has_previous,
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Failed to fetch offers');
  }
}

export async function handleFetchHistoryOffers(
  payload: GetHistoryRequestsQuery,
): Promise<MessageResponse<PaginatedOffersData>> {
  try {
    const { data } = await apiClient.get(
      '/offers/history',
      { params: payload },
    );
    const result = data.data;
    return ok({
      data: result.transferHistories ?? result.data ?? [],
      page: result.page,
      total: result.total,
      totalPages: result.totalPages,
      has_next: result.has_next,
      has_previous: result.has_previous,
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Failed to fetch history');
  }
}

export async function handlePrepareApprove(payload: {
  contractId: string;
  tokenId: string;
}): Promise<MessageResponse<PrepareData>> {
  try {
    const { data } = await apiClient.post(
      '/offers/approve/prepare',
      payload,
    );
    return ok({ preparedData: data.data });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Prepare approve failed');
  }
}

export async function handlePrepareReject(payload: {
  contractId: string;
  tokenId: string;
}): Promise<MessageResponse<PrepareData>> {
  try {
    const { data } = await apiClient.post(
      '/offers/reject/prepare',
      payload,
    );
    return ok({ preparedData: data.data });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Prepare reject failed');
  }
}

export async function handleFetchActivity(payload: {
  page: number;
  limit: number;
}): Promise<MessageResponse<PaginatedActivityData>> {
  try {
    const partyId = await sessionStore.get('partyId');
    if (!partyId) return err('No party ID');

    const { data } = await apiClient.get('/external-party/tx-history', {
      params: { ...payload, partyId },
    });
    const result = data.data;
    return ok({
      data: result.data ?? [],
      page: result.page,
      total: result.total,
      totalPages: result.totalPages,
      has_next: result.has_next,
      has_previous: result.has_previous,
    });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Failed to fetch activity');
  }
}

export async function handleFetchAboutMe(): Promise<
  MessageResponse<AboutMeData>
> {
  try {
    const { data } = await apiClient.get('/auth/me');
    return ok({ aboutMe: data.data });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Failed to fetch user info');
  }
}

export async function handleRequestFaucet(
  password: string,
  amount: string,
): Promise<MessageResponse<{ success: boolean }>> {
  try {
    const partyId = await sessionStore.get('partyId');
    if (!partyId) return err('No party ID');

    // Use cached private key (preferred) or decrypt from keystore
    let privateKey = getCachedPrivateKey();
    if (!privateKey) {
      const keystore = await localStore.get('keystore');
      if (!keystore) return err('No keystore found');
      const { getEncryptionProvider } = await import('../encryption');
      const provider = await getEncryptionProvider();
      privateKey = await provider.decryptKey(keystore, password);
    }

    // Step 1: Call dapp-core to prepare the DevNet Tap
    const { data: prepareRes } = await apiClient.post(
      '/external-party/devnet-tap/prepare',
      { partyId, amount },
    );
    const prepared = prepareRes.data;
    if (!prepared?.preparedTransactionHash) {
      return err('Faucet prepare returned no transaction hash');
    }

    // Step 2: Sign locally
    const signature = signTransactionHash(prepared.preparedTransactionHash, privateKey);
    const publicKey = getPublicKeyFromPrivate(privateKey);

    // Step 3: Submit signed transaction to dapp-core
    await apiClient.post('/external-party/devnet-tap/submit', {
      preparedTransaction: prepared.preparedTransaction,
      preparedTransactionHash: prepared.preparedTransactionHash,
      signature,
      publicKey,
      partyId,
    });

    return ok({ success: true });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Faucet request failed');
  }
}

export async function handlePrepareWithdraw(payload: {
  contractId: string;
  tokenId: string;
}): Promise<MessageResponse<PrepareData>> {
  try {
    const { data } = await apiClient.post(
      '/offers/withdraw/prepare',
      payload,
    );
    return ok({ preparedData: data.data });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Prepare withdraw failed');
  }
}
