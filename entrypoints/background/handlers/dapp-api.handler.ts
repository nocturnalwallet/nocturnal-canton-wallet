/**
 * CIP-0103 dApp API handler for Ginkgo wallet extension.
 *
 * Implements the CIP-0103 dApp API methods:
 * - connect / disconnect / isConnected / status
 * - listAccounts / getPrimaryAccount
 * - signMessage / signTransaction
 * - prepareExecute / prepareExecuteAndWait (via Wallet Gateway)
 * - ledgerApi (proxy to Wallet Gateway)
 */
import { signTransactionHash, getPublicKeyFromPrivate } from '@canton-network/core-signing-lib';
import {
  type SpliceMessage,
  WalletEvent,
  jsonRpcSuccess,
  jsonRpcError,
  RpcErrorCodes,
} from '@lib/dapp-api/types';
import type {
  PrepareExecuteParams,
  PrepareExecuteResponse,
  GatewayTransaction,
  LedgerApiParams,
  PrepareExecuteAndWaitResult,
} from '@lib/dapp-api/gateway-types';
import { sessionStore, localStore, networkStore } from '@lib/storage';
import { NETWORKS } from '@lib/network';
import { getCachedPrivateKey, resetAutoLockTimer } from './session.handler';
import { APPROVAL_REQUIRED_METHODS, requestApproval } from './approval.handler';
import {
  gatewayFacadeDappRpc,
  gatewayFacadeUserRpc,
  getGatewayFacadeBaseUrl,
  FacadeAuthRequiredError,
  FacadeRpcError,
} from '../gateway-facade-client';

// -- CIP-0103 Account type (matches @canton-network/dapp-sdk Wallet) --

interface DappAccount {
  primary: boolean;
  partyId: string;
  status: 'initialized' | 'allocated';
  hint: string;
  publicKey: string;
  namespace: string;
  networkId: string;
  signingProviderId: string;
  disabled?: boolean;
  reason?: string;
}

// -- Helpers --

/** Check wallet readiness: unlocked + has a partyId (= onboarded). */
async function getWalletState() {
  const unlocked = await sessionStore.get('unlocked');
  const partyId = await sessionStore.get('partyId');
  return { unlocked, partyId, isReady: unlocked && !!partyId };
}

/**
 * Build a full DappAccount (Wallet) object from the current wallet state.
 * Returns null if wallet is not ready (locked or no partyId).
 */
export async function buildDappAccount(): Promise<DappAccount | null> {
  const { partyId, isReady } = await getWalletState();
  if (!isReady || !partyId) return null;

  const [hint, namespace] = partyId.split('::');
  const networkId = await networkStore.get();

  let publicKey = '';
  try {
    const privateKey = getCachedPrivateKey();
    if (privateKey) {
      publicKey = getPublicKeyFromPrivate(privateKey);
    }
  } catch {
    // Non-critical: publicKey will be empty when locked
  }

  return {
    primary: true,
    partyId,
    status: 'allocated',
    hint: hint || '',
    publicKey,
    namespace: namespace || '',
    networkId,
    signingProviderId: 'ginkgo',
  };
}

// -- Method handlers --

async function handleConnect(): Promise<unknown> {
  const { unlocked, partyId, isReady } = await getWalletState();

  return {
    isConnected: isReady,
    reason: !unlocked ? 'Wallet is locked' : !partyId ? 'No party onboarded' : 'OK',
    isNetworkConnected: true,
    networkReason: 'OK',
  };
}

async function handleDisconnect(): Promise<null> {
  // No-op for prototype — wallet remains active, just acknowledges disconnect
  return null;
}

async function handleIsConnected(): Promise<unknown> {
  return handleConnect();
}

async function handleGetActiveNetwork(): Promise<unknown> {
  const networkId = await networkStore.get();
  const config = NETWORKS[networkId];
  return {
    id: networkId,
    name: config.label,
    apiBaseUrl: config.apiBaseUrl,
  };
}

async function handleStatus(): Promise<unknown> {
  const { unlocked, partyId, isReady } = await getWalletState();
  const networkId = await networkStore.get();
  const config = NETWORKS[networkId];

  return {
    provider: {
      id: 'ginkgo',
      version: '0.2.0',
      providerType: 'browser',
    },
    connection: {
      isConnected: isReady,
      reason: !unlocked ? 'Wallet is locked' : !partyId ? 'No party onboarded' : 'OK',
    },
    network: {
      id: networkId,
      name: config.label,
    },
    session: {
      isAuthenticated: unlocked,
      partyId: partyId || undefined,
    },
  };
}

async function handleListAccounts(): Promise<DappAccount[]> {
  const account = await buildDappAccount();
  if (!account) return [];
  return [account];
}

async function handleGetPrimaryAccount(): Promise<DappAccount> {
  const account = await buildDappAccount();
  if (!account) throw new Error('No active account — wallet must be unlocked and onboarded');
  return account;
}

async function handleSignMessage(params: unknown): Promise<string> {
  const { message } = (params || {}) as { message?: string };
  if (!message || typeof message !== 'string') {
    throw new Error('Missing or invalid "message" parameter');
  }

  const { partyId, isReady } = await getWalletState();
  if (!isReady || !partyId) {
    throw new Error('Wallet must be unlocked and onboarded to sign');
  }

  // Get cached private key (set during unlock)
  const privateKey = getCachedPrivateKey();
  if (!privateKey) {
    throw new Error('Private key not available — please unlock the wallet');
  }

  // Hash the message to produce a valid input for signTransactionHash.
  // signTransactionHash expects a hex-encoded hash, not raw text.
  const msgBytes = new TextEncoder().encode(message);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', msgBytes));
  const hexHash = Array.from(digest).map((b) => b.toString(16).padStart(2, '0')).join('');

  const signature = signTransactionHash(hexHash, privateKey);

  resetAutoLockTimer();
  return signature;
}

async function handleSignTransaction(params: unknown): Promise<{
  signature: string;
  publicKey: string;
  fingerprint: string;
}> {
  const { transactionHash } = (params || {}) as { transactionHash?: string };
  if (!transactionHash) throw new Error('Missing "transactionHash" parameter');

  const { partyId, isReady } = await getWalletState();
  if (!isReady || !partyId) throw new Error('Wallet must be unlocked and onboarded');

  const privateKey = getCachedPrivateKey();
  if (!privateKey) throw new Error('Private key not available — unlock wallet');

  const signature = signTransactionHash(transactionHash, privateKey);
  const publicKey = getPublicKeyFromPrivate(privateKey);
  const fingerprint = partyId.split('::')[1];

  resetAutoLockTimer();
  return { signature, publicKey, fingerprint };
}

// -- Gateway-mediated CIP-0103 handlers --

/**
 * prepareExecute: Full transaction lifecycle via Wallet Gateway.
 *
 * Flow:
 * 1. Forward command to Gateway dApp API → receive { userUrl } with commandId
 * 2. Show approval popup to user
 * 3. If approved: sign preparedTransactionHash locally, call Gateway execute
 * 4. Return result to dApp
 *
 * The extension signs locally (not via relay) since the private key is in memory.
 * The signing relay handles Gateway-initiated signing independently.
 */
async function handlePrepareExecute(params: unknown): Promise<unknown> {
  if (!getGatewayFacadeBaseUrl()) {
    throw new Error('Wallet facade not configured for this network');
  }

  const { partyId, isReady } = await getWalletState();
  if (!isReady || !partyId) throw new Error('Wallet must be unlocked and onboarded');

  const privateKey = getCachedPrivateKey();
  if (!privateKey) throw new Error('Private key not available — unlock wallet');

  const typedParams = params as PrepareExecuteParams;

  // 1. Forward to Gateway dApp API
  const { userUrl } = await gatewayFacadeDappRpc<PrepareExecuteResponse>('prepareExecute', typedParams);

  // 2. Extract commandId from userUrl
  const url = new URL(userUrl);
  const commandId = url.searchParams.get('commandId');
  if (!commandId) throw new Error('No commandId in Gateway response');

  // 3. Show approval popup
  const approved = await requestApproval('prepareExecute', 'dApp', {
    commandId,
    commands: typedParams.commands,
  });

  if (!approved) {
    // Clean up the pending transaction from Gateway
    try {
      await gatewayFacadeUserRpc('deleteTransaction', { commandId });
    } catch {
      // Best-effort cleanup
    }
    throw new Error('User rejected the transaction');
  }

  // 4. Get prepared transaction details from Gateway
  const tx = await gatewayFacadeUserRpc<GatewayTransaction>('getTransaction', { commandId });

  // 5. Sign locally
  const { signTransactionHash, getPublicKeyFromPrivate } = await import(
    '@canton-network/core-signing-lib'
  );
  const signature = signTransactionHash(tx.preparedTransactionHash, privateKey);
  const fingerprint = partyId.split('::')[1];

  // 6. Execute via Gateway
  const result = await gatewayFacadeUserRpc('execute', {
    commandId,
    signature,
    signedBy: fingerprint,
    partyId,
  });

  resetAutoLockTimer();
  return result;
}

/**
 * prepareExecuteAndWait: Same as prepareExecute but returns the full execution result.
 */
async function handlePrepareExecuteAndWait(params: unknown): Promise<PrepareExecuteAndWaitResult> {
  if (!getGatewayFacadeBaseUrl()) {
    throw new Error('Wallet facade not configured for this network');
  }

  const { partyId, isReady } = await getWalletState();
  if (!isReady || !partyId) throw new Error('Wallet must be unlocked and onboarded');

  const privateKey = getCachedPrivateKey();
  if (!privateKey) throw new Error('Private key not available — unlock wallet');

  const typedParams = params as PrepareExecuteParams;

  const { userUrl } = await gatewayFacadeDappRpc<PrepareExecuteResponse>('prepareExecute', typedParams);

  const url = new URL(userUrl);
  const commandId = url.searchParams.get('commandId');
  if (!commandId) throw new Error('No commandId in Gateway response');

  const approved = await requestApproval('prepareExecuteAndWait', 'dApp', {
    commandId,
    commands: typedParams.commands,
  });

  if (!approved) {
    try {
      await gatewayFacadeUserRpc('deleteTransaction', { commandId });
    } catch {
      // Best-effort cleanup
    }
    throw new Error('User rejected the transaction');
  }

  const tx = await gatewayFacadeUserRpc<GatewayTransaction>('getTransaction', { commandId });

  const { signTransactionHash, getPublicKeyFromPrivate } = await import(
    '@canton-network/core-signing-lib'
  );
  const signature = signTransactionHash(tx.preparedTransactionHash, privateKey);
  const fingerprint = partyId.split('::')[1];

  const executeResult = await gatewayFacadeUserRpc('execute', {
    commandId,
    signature,
    signedBy: fingerprint,
    partyId,
  });

  resetAutoLockTimer();

  return {
    tx: {
      status: 'executed',
      commandId,
      payload: executeResult,
    },
  };
}

/**
 * ledgerApi: Proxy to the Wallet Gateway's Ledger API.
 *
 * Normalizes legacy uppercase `requestMethod` and stringified `body` from older
 * dApp callers — wallet-gateway-remote ≥ 1.1.0 requires lowercase method names
 * and an object body.
 */
async function handleLedgerApi(params: unknown): Promise<unknown> {
  if (!getGatewayFacadeBaseUrl()) {
    throw new Error('Wallet facade not configured for this network');
  }

  const { isReady } = await getWalletState();
  if (!isReady) throw new Error('Wallet must be unlocked and onboarded');

  const raw = params as Partial<LedgerApiParams> & { requestMethod?: string; body?: unknown };
  const normalized: LedgerApiParams = {
    requestMethod: (raw.requestMethod ?? 'get').toLowerCase() as LedgerApiParams['requestMethod'],
    resource: raw.resource ?? '',
    body:
      typeof raw.body === 'string'
        ? (JSON.parse(raw.body) as Record<string, unknown>)
        : (raw.body as Record<string, unknown> | undefined),
  };

  const result = await gatewayFacadeDappRpc('ledgerApi', normalized);

  resetAutoLockTimer();
  return result;
}

// -- Main dispatcher --

type MethodHandler = (params?: unknown) => Promise<unknown>;

const methods: Record<string, MethodHandler> = {
  connect: handleConnect,
  disconnect: handleDisconnect,
  isConnected: handleIsConnected,
  status: handleStatus,
  getActiveNetwork: handleGetActiveNetwork,
  listAccounts: handleListAccounts,
  getPrimaryAccount: handleGetPrimaryAccount,
  signMessage: handleSignMessage,
  signTransaction: handleSignTransaction,
  prepareExecute: handlePrepareExecute,
  prepareExecuteAndWait: handlePrepareExecuteAndWait,
  ledgerApi: handleLedgerApi,
};

/**
 * Handle a CIP-0103 JSON-RPC request from the content script.
 * Returns a SpliceMessage response.
 *
 * @param senderOrigin - The origin of the requesting dApp (e.g. "http://localhost:5173")
 */
export async function handleDappApiRequest(
  msg: SpliceMessage,
  senderOrigin?: string,
): Promise<SpliceMessage> {
  if (msg.type !== WalletEvent.SPLICE_WALLET_REQUEST) {
    return jsonRpcError(null, RpcErrorCodes.INVALID_REQUEST, 'Not a request message');
  }

  const { request } = msg;
  const id = request.id ?? null;
  const method = request.method;

  const handler = methods[method];
  if (!handler) {
    return jsonRpcError(id, RpcErrorCodes.METHOD_NOT_FOUND, `Method "${method}" not found`);
  }

  // Gate sensitive methods through user approval popup
  if (APPROVAL_REQUIRED_METHODS.has(method)) {
    const origin = senderOrigin || 'Unknown origin';
    const approved = await requestApproval(method, origin, request.params);
    if (!approved) {
      return jsonRpcError(id, RpcErrorCodes.USER_REJECTED, 'User rejected the request');
    }
  }

  try {
    const result = await handler(request.params);
    return jsonRpcSuccess(id, result);
  } catch (e) {
    if (e instanceof FacadeAuthRequiredError) {
      // Wallet's session is gone — generic envelope to dApp; the popup will route to sign-in
      // (popup side-effect dispatched elsewhere; the dApp just needs to know to back off).
      return jsonRpcError(id, RpcErrorCodes.INTERNAL_ERROR, 'Wallet locked');
    }
    if (e instanceof FacadeRpcError) {
      // Forward the facade's code+message verbatim so the dApp sees the actual JSON-RPC
      // error code (e.g., -32001/-32002/-32003/-32004/-32601) and a useful message.
      return jsonRpcError(id, e.code, e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    return jsonRpcError(id, RpcErrorCodes.INTERNAL_ERROR, message);
  }
}
