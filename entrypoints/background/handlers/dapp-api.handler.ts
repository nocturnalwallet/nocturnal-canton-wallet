/**
 * CIP-0103 dApp API handler for Ginkgo wallet extension.
 *
 * Implements the CIP-0103 dApp API methods:
 * - connect / disconnect / isConnected / status
 * - getActiveNetwork / listAccounts / getPrimaryAccount
 * - signMessage
 * - prepareExecute / prepareExecuteAndWait (via Wallet Gateway)
 * - ledgerApi (proxy to Wallet Gateway)
 *
 * Plus one Ginkgo-only extension method:
 * - signTransaction — NON-STANDARD. Signs a raw base64-encoded transaction
 *   hash. Not in CIP-0103; not in the SWK extension reference
 *   (wallet-gateway/extension/src/dapp-api/controller.ts:20-80). Kept as a
 *   convenience for raw-hash signing flows. Prefer prepareExecute /
 *   prepareExecuteAndWait when integrating new dApps — those cover
 *   prepare+sign+execute atomically.
 */
import { signMessage, signTransactionHash, getPublicKeyFromPrivate } from '@canton-network/core-signing-lib';
import {
  type SpliceMessage,
  WalletEvent,
  jsonRpcSuccess,
  jsonRpcError,
  RpcErrorCodes,
  RpcError,
} from '@lib/dapp-api/types';
import type {
  PrepareExecuteParams,
  PrepareExecuteResponse,
  GatewayTransaction,
  LedgerApiParams,
  PrepareExecuteAndWaitResult,
} from '@lib/dapp-api/gateway-types';
import { sessionStore, localStore, networkStore } from '@lib/storage';
import { NETWORKS, toCaip2NetworkId } from '@lib/network';
import { getCachedPrivateKey, resetAutoLockTimer } from './session.handler';
import { APPROVAL_REQUIRED_METHODS, requestApproval } from './approval.handler';
import {
  gatewayFacadeDappRpc,
  gatewayFacadeUserRpc,
  getGatewayFacadeBaseUrl,
  FacadeAuthRequiredError,
  FacadeNetworkError,
  FacadeRpcError,
} from '../gateway-facade-client';

// -- CIP-0103 Account type (matches @canton-network/dapp-sdk Wallet) --

interface DappAccount {
  primary: boolean;
  partyId: string;
  // CIP-0103 Wallet.status union — Ginkgo currently only writes 'allocated'
  // but advertises 'removed' for type parity with @canton-network/dapp-sdk's
  // Wallet type. Schema-validating SDKs reject status values outside the
  // spec union; widening the declared type here keeps future emissions
  // type-safe without changing runtime behavior today.
  status: 'initialized' | 'allocated' | 'removed';
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
    // Wallet.networkId is a CAIP-2-compliant chain identifier per the spec
    // schema at openrpc-dapp-api.json:874-877; we emit the converted form
    // (e.g. `canton:devnet`), keeping the internal short ID for storage keys.
    networkId: toCaip2NetworkId(networkId),
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
  // No-op by design. Matches the SWK extension reference at
  // wallet-gateway/extension/src/dapp-api/controller.ts:30
  // (`disconnect: async () => Promise.resolve(null)`).
  //
  // CIP-0103's disconnect text ("invalidates the user session on the server")
  // describes the *remote* wallet variant, which has per-dApp server sessions
  // created via a userUrl login flow. The extension variant has no equivalent:
  // the user authenticates to the wallet itself once (one OAuth token for the
  // whole user), not per-dApp. There is no per-dApp session token to invalidate
  // here, and clearing the wallet-level OAuth would forcibly sign the user out
  // across every tab — wrong semantics for an extension.
  //
  // A real per-origin disconnect would require adding a connected-sites
  // allowlist + per-origin event routing. That is a separate, larger feature
  // and is not implied by CIP-0103 or by the SWK extension reference.
  return null;
}

async function handleIsConnected(): Promise<unknown> {
  return handleConnect();
}

async function handleGetActiveNetwork(): Promise<unknown> {
  const networkId = await networkStore.get();
  const config = NETWORKS[networkId];
  // CIP-0103 Network schema (openrpc-dapp-api.json:791-816) declares
  // additionalProperties: false. The previous release emitted an extra
  // `name` field — that was a misreading of the spec; the schema forbids
  // additional properties. dApps that want a display name should source
  // it from their own copy of NETWORKS or hardcode a label based on networkId.
  return {
    networkId: toCaip2NetworkId(networkId),
    ledgerApi: config.apiBaseUrl,
  };
}

/**
 * Build a CIP-0103 StatusEvent matching the dApp API spec.
 *
 * Single source of truth for the StatusEvent shape — used by both the
 * `status` method handler AND the event-broadcaster's `statusChanged` push.
 * Both paths MUST emit the same shape; dApps will silently break if a
 * status-method response disagrees with statusChanged events.
 */
export async function buildStatusEvent(): Promise<unknown> {
  const { unlocked, partyId, isReady } = await getWalletState();
  const networkId = await networkStore.get();
  const config = NETWORKS[networkId];

  // ConnectResult per spec (openrpc-dapp-api.json:712-741): both isConnected
  // and isNetworkConnected are required booleans.
  const connection = {
    isConnected: isReady,
    reason: !unlocked ? 'Wallet is locked' : !partyId ? 'No party onboarded' : 'OK',
    isNetworkConnected: true,
    networkReason: 'OK',
  };

  // Session per spec (openrpc-dapp-api.json:819-834): { accessToken, userId }
  // with additionalProperties: false. Omit entirely when the user hasn't signed in.
  const authToken = await sessionStore.get('authToken');
  const user = await localStore.get('user');
  const session = authToken && user?.id
    ? { accessToken: authToken, userId: user.id }
    : undefined;

  return {
    provider: {
      id: 'ginkgo',
      version: '0.2.0',
      providerType: 'browser',
    },
    connection,
    network: {
      networkId: toCaip2NetworkId(networkId),
      ledgerApi: config.apiBaseUrl,
    },
    ...(session ? { session } : {}),
  };
}

async function handleStatus(): Promise<unknown> {
  return buildStatusEvent();
}

async function handleListAccounts(): Promise<DappAccount[]> {
  const account = await buildDappAccount();
  if (!account) return [];
  return [account];
}

async function handleGetPrimaryAccount(): Promise<DappAccount> {
  const account = await buildDappAccount();
  if (!account) {
    throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'No active account — wallet must be unlocked and onboarded');
  }
  return account;
}

async function handleSignMessage(params: unknown): Promise<{ signature: string }> {
  const { message } = (params || {}) as { message?: string };
  if (!message || typeof message !== 'string') {
    throw new RpcError(RpcErrorCodes.INVALID_PARAMS, 'Missing or invalid "message" parameter');
  }

  const { partyId, isReady } = await getWalletState();
  if (!isReady || !partyId) {
    throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Wallet must be unlocked and onboarded to sign');
  }

  const privateKey = getCachedPrivateKey();
  if (!privateKey) {
    throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Private key not available — please unlock the wallet');
  }

  // CIP-0103 canonical signMessage: Ed25519 over UTF-8(message) directly.
  // The kernel's signMessage does nacl.sign.detached(utf8(message), sk) and
  // base64-encodes the signature — the only shape any standard Ed25519
  // verifier will accept against the bare message bytes.
  //
  // Return shape is { signature } only per CIP-0103 OpenRPC schema and CIP text.
  // dApps source publicKey/partyId via getPrimaryAccount or listAccounts.
  const signature = signMessage(message, privateKey);

  resetAutoLockTimer();
  return { signature };
}

// Strict base64 (standard + url-safe + optional padding). signTransactionHash
// silently base64-decodes its input and signs the resulting bytes, so a hex
// string would decode to garbage and sign that. Reject anything that's not
// unambiguously base64 to surface the failure mode loudly.
const BASE64_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;
// 64-char lowercase hex is the most common "looks like base64 but isn't"
// input — every char (0-9, a-f) is also a base64 char. Catch it explicitly.
const HEX_64_PATTERN = /^[0-9a-f]{64}$/;

/**
 * signTransaction — Ginkgo extension method (NON-STANDARD).
 *
 * Not part of CIP-0103. Not in the SWK extension reference's method catalog
 * (verified against wallet-gateway/extension/src/dapp-api/controller.ts:20-80
 * and api-specs/openrpc-dapp-api.json — only signMessage is listed among
 * signing methods). Kept as a convenience for raw base64-encoded hash signing
 * flows that already have a prepared transaction hash and just need the wallet
 * to sign it.
 *
 * For new dApp integrations, prefer the canonical CIP-0103 flow:
 * prepareExecute / prepareExecuteAndWait — those cover prepare + sign +
 * execute as a single atomic dApp call, with approval and tx lifecycle events.
 */
async function handleSignTransaction(params: unknown): Promise<{
  signature: string;
  publicKey: string;
  fingerprint: string;
}> {
  const { transactionHash } = (params || {}) as { transactionHash?: string };
  if (!transactionHash || typeof transactionHash !== 'string') {
    throw new RpcError(RpcErrorCodes.INVALID_PARAMS, 'Missing or invalid "transactionHash" parameter');
  }
  if (!BASE64_PATTERN.test(transactionHash) || HEX_64_PATTERN.test(transactionHash)) {
    throw new RpcError(
      RpcErrorCodes.INVALID_PARAMS,
      '"transactionHash" must be base64-encoded (got something that looks like hex or contains invalid chars)',
    );
  }

  const { partyId, isReady } = await getWalletState();
  if (!isReady || !partyId) {
    throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Wallet must be unlocked and onboarded');
  }

  const privateKey = getCachedPrivateKey();
  if (!privateKey) {
    throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Private key not available — unlock wallet');
  }

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
async function handlePrepareExecute(params: unknown): Promise<null> {
  if (!getGatewayFacadeBaseUrl()) {
    throw new RpcError(RpcErrorCodes.RESOURCE_UNAVAILABLE, 'Wallet facade not configured for this network');
  }

  const { partyId, isReady } = await getWalletState();
  if (!isReady || !partyId) throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Wallet must be unlocked and onboarded');

  const privateKey = getCachedPrivateKey();
  if (!privateKey) throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Private key not available — unlock wallet');

  const typedParams = params as PrepareExecuteParams;

  // 1. Forward to Gateway dApp API
  const { userUrl } = await gatewayFacadeDappRpc<PrepareExecuteResponse>('prepareExecute', typedParams);

  // 2. Extract ids from userUrl. Gateway v1.1.0 carries both:
  //   - transactionId: gateway store primary key, the lookup key for all
  //     user-API methods (getTransaction/execute/deleteTransaction).
  //   - commandId: application-level id, echoed in events; kept for UI/audit
  //     and reused in the TxChangedExecutedEvent response shape.
  const url = new URL(userUrl);
  const transactionId = url.searchParams.get('transactionId');
  const commandId = url.searchParams.get('commandId');
  if (!transactionId) throw new RpcError(RpcErrorCodes.INTERNAL_ERROR, 'No transactionId in Gateway response');
  if (!commandId) throw new RpcError(RpcErrorCodes.INTERNAL_ERROR, 'No commandId in Gateway response');

  // 3. Show approval popup
  const approved = await requestApproval('prepareExecute', 'dApp', {
    transactionId,
    commandId,
    commands: typedParams.commands,
  });

  if (!approved) {
    // Clean up the pending transaction from Gateway
    try {
      await gatewayFacadeUserRpc('deleteTransaction', { transactionId });
    } catch {
      // Best-effort cleanup
    }
    throw new RpcError(RpcErrorCodes.USER_REJECTED, 'User rejected the transaction');
  }

  // 4. Get prepared transaction details from Gateway
  const tx = await gatewayFacadeUserRpc<GatewayTransaction>('getTransaction', { transactionId });

  // 5. Sign locally
  const { signTransactionHash } = await import('@canton-network/core-signing-lib');
  const signature = signTransactionHash(tx.preparedTransactionHash, privateKey);
  const fingerprint = partyId.split('::')[1];

  // 6. Execute via Gateway. Result is discarded — the spec defines
  // prepareExecute's result schema as `Null` (openrpc-dapp-api.json:80-82).
  // dApps that want the execute result should call prepareExecuteAndWait
  // instead, which returns { tx: TxChangedExecutedEvent }.
  await gatewayFacadeUserRpc('execute', {
    transactionId,
    signature,
    signedBy: fingerprint,
    partyId,
  });

  resetAutoLockTimer();
  return null;
}

/**
 * prepareExecuteAndWait: Same as prepareExecute but returns the full execution result.
 */
async function handlePrepareExecuteAndWait(params: unknown): Promise<PrepareExecuteAndWaitResult> {
  if (!getGatewayFacadeBaseUrl()) {
    throw new RpcError(RpcErrorCodes.RESOURCE_UNAVAILABLE, 'Wallet facade not configured for this network');
  }

  const { partyId, isReady } = await getWalletState();
  if (!isReady || !partyId) throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Wallet must be unlocked and onboarded');

  const privateKey = getCachedPrivateKey();
  if (!privateKey) throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Private key not available — unlock wallet');

  const typedParams = params as PrepareExecuteParams;

  const { userUrl } = await gatewayFacadeDappRpc<PrepareExecuteResponse>('prepareExecute', typedParams);

  const url = new URL(userUrl);
  const transactionId = url.searchParams.get('transactionId');
  const commandId = url.searchParams.get('commandId');
  if (!transactionId) throw new RpcError(RpcErrorCodes.INTERNAL_ERROR, 'No transactionId in Gateway response');
  if (!commandId) throw new RpcError(RpcErrorCodes.INTERNAL_ERROR, 'No commandId in Gateway response');

  const approved = await requestApproval('prepareExecuteAndWait', 'dApp', {
    transactionId,
    commandId,
    commands: typedParams.commands,
  });

  if (!approved) {
    try {
      await gatewayFacadeUserRpc('deleteTransaction', { transactionId });
    } catch {
      // Best-effort cleanup
    }
    throw new RpcError(RpcErrorCodes.USER_REJECTED, 'User rejected the transaction');
  }

  const tx = await gatewayFacadeUserRpc<GatewayTransaction>('getTransaction', { transactionId });

  const { signTransactionHash } = await import('@canton-network/core-signing-lib');
  const signature = signTransactionHash(tx.preparedTransactionHash, privateKey);
  const fingerprint = partyId.split('::')[1];

  const executeResult = await gatewayFacadeUserRpc<{
    updateId: string;
    completionOffset: number;
  }>('execute', {
    transactionId,
    signature,
    signedBy: fingerprint,
    partyId,
  });

  resetAutoLockTimer();

  // CIP-0103 prepareExecuteAndWait result schema (openrpc-dapp-api.json:95-105):
  // { tx: TxChangedExecutedEvent }, where TxChangedExecutedEvent is
  // { status: 'executed', commandId, payload: { updateId, completionOffset } }.
  // The published @canton-network/dapp-sdk 1.2.0 type confirms the same wrap.
  return {
    tx: {
      status: 'executed',
      commandId,
      payload: {
        updateId: executeResult.updateId,
        completionOffset: executeResult.completionOffset,
      },
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
    throw new RpcError(RpcErrorCodes.RESOURCE_UNAVAILABLE, 'Wallet facade not configured for this network');
  }

  const { isReady } = await getWalletState();
  if (!isReady) throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Wallet must be unlocked and onboarded');

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
  // Ginkgo extension, NOT in CIP-0103 — see JSDoc on handleSignTransaction.
  // Prefer prepareExecute / prepareExecuteAndWait for new integrations.
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
    if (e instanceof FacadeNetworkError) {
      // Backend unreachable — generic envelope to dApp; don't leak the URL.
      return jsonRpcError(id, RpcErrorCodes.INTERNAL_ERROR, 'Wallet unavailable');
    }
    // RpcError carries an explicit code from the handler.
    if (e instanceof RpcError) {
      return jsonRpcError(id, e.code, e.message, e.data);
    }
    const message = e instanceof Error ? e.message : String(e);
    return jsonRpcError(id, RpcErrorCodes.INTERNAL_ERROR, message);
  }
}
