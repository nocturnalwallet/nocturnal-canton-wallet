import { signTransactionHash } from '@canton-network/core-signing-lib';
import { ok, err } from '@lib/messaging';
import type {
  MessageResponse,
  BalancesData,
  PaginatedOffersData,

  AboutMeData,
  PrepareData,
  ElfaTrendingTokensData,
  ElfaNarrativesData,
  ElfaTopMentionsData,
  ElfaKeywordMentionsData,
  ElfaSmartStats,
  ElfaChatBlob,
} from '@lib/messaging';
import type {
  PrepareTransferProps,
  PrepareTransferTokenStandardProps,
  GetIncomingRequestsQuery,
  GetHistoryRequestsQuery,
} from '@lib/types';
import {
  getStorageScope,
  hasUserScope,
  localStore,
  sessionStore,
} from '@lib/storage';
import {
  appendElfaTurn,
  emptyElfaChat,
  parseElfaChat,
} from '@lib/elfa-chat';
import { getErrorMessage } from '@lib/api-error';
import apiClient from '../api-client';
import { getCachedPrivateKey } from './session.handler';

let elfaChatTranscriptGeneration = 0;

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

export async function handleFetchElfaTopMentions(
  ticker: string,
): Promise<MessageResponse<ElfaTopMentionsData>> {
  try {
    const { data } = await apiClient.get('/elfa/top-mentions', {
      params: { ticker, pageSize: '15' },
    });
    return ok(data.data);
  } catch (e: unknown) {
    return err(getErrorMessage(e, 'Failed to load mentions'));
  }
}

export async function handleFetchElfaKeywordMentions(
  keywords: string,
): Promise<MessageResponse<ElfaKeywordMentionsData>> {
  try {
    const { data } = await apiClient.get('/elfa/keyword-mentions', {
      params: { keywords, limit: '20' },
    });
    return ok(data.data);
  } catch (e: unknown) {
    return err(getErrorMessage(e, 'Search failed'));
  }
}

export async function handleFetchElfaSmartStats(
  username: string,
): Promise<MessageResponse<ElfaSmartStats>> {
  try {
    const { data } = await apiClient.get('/elfa/smart-stats', {
      params: { username },
    });
    return ok(data.data);
  } catch (e: unknown) {
    return err(getErrorMessage(e, 'Failed to load account stats'));
  }
}

export async function handleGetElfaChat(): Promise<
  MessageResponse<ElfaChatBlob>
> {
  if (!hasUserScope()) return err('Not signed in');

  try {
    return ok(parseElfaChat(await localStore.get('elfaChat')));
  } catch (e: unknown) {
    return err(getErrorMessage(e, 'Failed to load chat'));
  }
}

function getElfaChatErrorExtras(error: unknown): {
  status?: number;
  retryAfterSeconds?: number;
} {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return {};
  }

  const response = (
    error as {
      response?: {
        status?: unknown;
        data?: { retryAfterSeconds?: unknown };
        headers?: Record<string, unknown> & {
          get?: (name: string) => unknown;
        };
      };
    }
  ).response;
  if (!response) return {};

  const extras: { status?: number; retryAfterSeconds?: number } = {};
  if (typeof response.status === 'number') {
    extras.status = response.status;
  }

  const bodyDelay = response.data?.retryAfterSeconds;
  if (typeof bodyDelay === 'number' && Number.isFinite(bodyDelay)) {
    extras.retryAfterSeconds = bodyDelay;
    return extras;
  }

  const headerDelay =
    response.headers?.['retry-after'] ?? response.headers?.get?.('retry-after');
  const parsedDelay =
    typeof headerDelay === 'number'
      ? headerDelay
      : typeof headerDelay === 'string'
        ? Number.parseInt(headerDelay, 10)
        : Number.NaN;
  if (Number.isFinite(parsedDelay)) {
    extras.retryAfterSeconds = parsedDelay;
  }

  return extras;
}

export async function handleElfaChat(
  message: string,
): Promise<MessageResponse<ElfaChatBlob>> {
  if (!hasUserScope()) return err('Not signed in');
  const storageScope = getStorageScope();
  const transcriptGeneration = elfaChatTranscriptGeneration;

  try {
    const stored = parseElfaChat(await localStore.get('elfaChat'));
    const body = stored.sessionId
      ? { message, sessionId: stored.sessionId }
      : { message };
    const { data } = await apiClient.post(
      '/elfa/chat',
      body,
      { timeout: 65_000 },
    );
    const result: unknown = data.data;
    if (
      !result ||
      typeof result !== 'object' ||
      !('message' in result) ||
      typeof result.message !== 'string' ||
      !('sessionId' in result) ||
      typeof result.sessionId !== 'string' ||
      result.sessionId.length === 0
    ) {
      return err('Chat returned an invalid response');
    }
    const updated = appendElfaTurn(
      stored,
      message,
      result.message,
      result.sessionId,
    );
    const currentScope = getStorageScope();
    if (
      elfaChatTranscriptGeneration === transcriptGeneration &&
      currentScope.userId === storageScope.userId &&
      currentScope.network === storageScope.network
    ) {
      await localStore.set('elfaChat', updated);
    }
    return ok(updated);
  } catch (e: unknown) {
    return err(
      getErrorMessage(e, 'Failed to send chat message'),
      getElfaChatErrorExtras(e),
    );
  }
}

export async function handleClearElfaChat(): Promise<
  MessageResponse<ElfaChatBlob>
> {
  if (!hasUserScope()) return err('Not signed in');
  elfaChatTranscriptGeneration += 1;

  try {
    const empty = emptyElfaChat();
    await localStore.set('elfaChat', empty);
    return ok(empty);
  } catch (e: unknown) {
    return err(getErrorMessage(e, 'Failed to clear chat'));
  }
}
