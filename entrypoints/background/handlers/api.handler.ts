import { signTransactionHash } from '@canton-network/core-signing-lib';
import { ok, err } from '@lib/messaging';
import type {
  MessageResponse,
  BalancesData,
  PaginatedOffersData,

  AboutMeData,
  PrepareData,
  ElfaTrendingTokensData,
  ElfaTokenNewsData,
  ElfaNarrativesData,
} from '@lib/messaging';
import type {
  PrepareTransferProps,
  PrepareTransferTokenStandardProps,
  GetIncomingRequestsQuery,
  GetHistoryRequestsQuery,
} from '@lib/types';
import { localStore, sessionStore } from '@lib/storage';
import { getErrorMessage } from '@lib/api-error';
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
    return err(getErrorMessage(e, 'Failed to fetch balances'));
  }
}

export async function handlePrepareTransferPreapproval(
  payload: PrepareTransferProps,
): Promise<MessageResponse<PrepareData>> {
  try {
    const { data } = await apiClient.post('/transfer-offer/prepare', {
      assetId: 'Amulet',
      assetAmount: String(payload.amount),
      receiverPartyId: payload.receiverPartyId,
      reason: payload.reason,
    });
    return ok({ preparedData: data.data });
  } catch (e: unknown) {
    return err(getErrorMessage(e, 'Prepare transfer failed'));
  }
}

export async function handlePrepareTransferTokenStandard(
  payload: PrepareTransferTokenStandardProps,
): Promise<MessageResponse<PrepareData>> {
  try {
    const { data } = await apiClient.post(
      '/transfer-offer/prepare',
      payload,
    );
    return ok({ preparedData: data.data });
  } catch (e: unknown) {
    return err(getErrorMessage(e, 'Prepare transfer failed'));
  }
}

// The backend's /transfer-offer/* endpoints return { page, totalPages, total, limit, <items> }
// but do NOT return has_next / has_previous (see canton-exchange-backend
// transfer.service.ts getTransferHistory/getIncomingTransferRequests/getOutgoingTransferRequests).
// Derive them from page + totalPages so the Prev/Next buttons in the UI are clickable.
function derivePagination(page: number, totalPages: number) {
  return {
    has_previous: page > 1,
    has_next: page < totalPages,
  };
}

export async function handleFetchIncomingOffers(
  payload: GetIncomingRequestsQuery,
): Promise<MessageResponse<PaginatedOffersData>> {
  try {
    const { data } = await apiClient.get(
      '/transfer-offer/incoming-requests',
      { params: payload },
    );
    const result = data.data;
    return ok({
      data: result.incomingRequestes ?? result.data ?? [],
      page: result.page,
      total: result.total,
      totalPages: result.totalPages,
      ...derivePagination(result.page, result.totalPages),
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
      '/transfer-offer/outgoing-requests',
      { params: payload },
    );
    const result = data.data;
    return ok({
      data: result.outgoingRequestes ?? result.data ?? [],
      page: result.page,
      total: result.total,
      totalPages: result.totalPages,
      ...derivePagination(result.page, result.totalPages),
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
      '/transfer-offer/history',
      { params: payload },
    );
    const result = data.data;
    return ok({
      data: result.transferHistories ?? result.data ?? [],
      page: result.page,
      total: result.total,
      totalPages: result.totalPages,
      ...derivePagination(result.page, result.totalPages),
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
      '/transfer-offer/approve/prepare',
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
      '/transfer-offer/reject/prepare',
      payload,
    );
    return ok({ preparedData: data.data });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Prepare reject failed');
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

    // Step 3: Submit signed transaction to dapp-core
    await apiClient.post('/external-party/devnet-tap/submit', {
      preparedTransaction: prepared.preparedTransaction,
      preparedTransactionHash: prepared.preparedTransactionHash,
      signature,
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
      '/transfer-offer/withdraw/prepare',
      payload,
    );
    return ok({ preparedData: data.data });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Prepare withdraw failed');
  }
}

// ── Elfa market intelligence (Phase 1) ──
// The wallet-provider backend proxies Elfa's /v2/* data API (the Elfa key stays
// server-side). Each handler unwraps the backend's `{ data }` envelope.

export async function handleFetchElfaTrendingTokens(
  window: string,
): Promise<MessageResponse<ElfaTrendingTokensData>> {
  try {
    const { data } = await apiClient.get('/elfa/trending-tokens', {
      params: { timeWindow: window, pageSize: '10' },
    });
    return ok(data.data);
  } catch (e: unknown) {
    return err(getErrorMessage(e, 'Failed to load trending tokens'));
  }
}

export async function handleFetchElfaTokenNews(
  window: string,
): Promise<MessageResponse<ElfaTokenNewsData>> {
  try {
    const { data } = await apiClient.get('/elfa/token-news', {
      params: { timeWindow: window, pageSize: '15' },
    });
    return ok(data.data);
  } catch (e: unknown) {
    return err(getErrorMessage(e, 'Failed to load token news'));
  }
}

export async function handleFetchElfaNarratives(
  window: string,
): Promise<MessageResponse<ElfaNarrativesData>> {
  try {
    // Narratives use timeFrame (day|week) rather than a rolling timeWindow.
    const { data } = await apiClient.get('/elfa/trending-narratives', {
      params: { timeFrame: window === '7d' ? 'week' : 'day' },
    });
    return ok(data.data);
  } catch (e: unknown) {
    return err(getErrorMessage(e, 'Failed to load narratives'));
  }
}
