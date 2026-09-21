/**
 * CIP-0103 dApp API handler for the wallet extension.
 *
 * Implements the CIP-0103 dApp API methods:
 * - connect / disconnect / isConnected / status
 * - getActiveNetwork / listAccounts / getPrimaryAccount
 * - signMessage
 * - prepareExecute / prepareExecuteAndWait (via the CIP-0103 facade)
 * - ledgerApi (proxy to the backend Ledger API via the facade)
 *
 * Plus one brand-specific extension method:
 * - signTransaction — NON-STANDARD. Signs a raw base64-encoded transaction
 *   hash. Not in CIP-0103; not in the SWK extension reference
 *   (wallet-gateway/extension/src/dapp-api/controller.ts:20-80). Kept as a
 *   convenience for raw-hash signing flows. Prefer prepareExecute /
 *   prepareExecuteAndWait when integrating new dApps — those cover
 *   prepare+sign+execute atomically.
 */
import brand from '@brand/brand';
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
import { resetAutoLockTimer } from './session.handler';
import { APPROVAL_REQUIRED_METHODS, requestApproval } from './approval.handler';
import { signHashWithPassword, signMessageWithPassword } from '../signing/sign-with-password';
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
  // CIP-0103 Wallet.status union — we currently only write 'allocated'
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
  const keystore = await localStore.get('keystore');
  if (keystore?.walletKey) publicKey = keystore.walletKey;

  return {
    primary: true,
    partyId,
    status: 'allocated',
    hint: hint || '',
    publicKey,
    namespace: namespace || '',
    // Wallet.networkId is a CAIP-2-compliant chain identifier per the spec
    // schema at openrpc-dapp-api.json:874-877; we emit DA-canonical form
    // (e.g. `canton:da-devnet`), keeping the internal short ID for storage keys.
    networkId: toCaip2NetworkId(networkId),
    signingProviderId: brand.providerId,
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
      id: brand.providerId,
      version: brand.version,
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

async function handleSignMessage(params: unknown, ctx?: DappCtx): Promise<{ signature: string }> {
  const { message } = (params || {}) as { message?: string };
  if (!message || typeof message !== 'string') {
    throw new RpcError(RpcErrorCodes.INVALID_PARAMS, 'Missing or invalid "message" parameter');
  }

  const { partyId, isReady } = await getWalletState();
  if (!isReady || !partyId) {
    throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Wallet must be unlocked and onboarded to sign');
  }

  if (!ctx?.password) {
    throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Password required to sign');
  }

  // CIP-0103 canonical signMessage: Ed25519 over UTF-8(message) directly.
  // Decrypt-on-demand with the approval-supplied password — the decrypted
  // key is never returned or persisted.
  //
  // Return shape is { signature } only per CIP-0103 OpenRPC schema and CIP text.
  // dApps source publicKey/partyId via getPrimaryAccount or listAccounts.
  const { signature } = await signMessageWithPassword(ctx.password, message);

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
 * signTransaction — extension method (NON-STANDARD).
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
async function handleSignTransaction(params: unknown, ctx?: DappCtx): Promise<{
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

  if (!ctx?.password) {
    throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Password required to sign');
  }

  const { signature, publicKey } = await signHashWithPassword(ctx.password, partyId, transactionHash);
  const fingerprint = partyId.split('::')[1];

  resetAutoLockTimer();
  return { signature, publicKey, fingerprint };
}

// -- Facade-mediated CIP-0103 handlers --

/**
 * prepareExecute: Full transaction lifecycle via the CIP-0103 facade.
 *
 * Flow:
 * 1. Forward command to the facade dApp API → receive { userUrl } with transactionId + commandId
 * 2. Show approval popup to user
 * 3. If approved: sign preparedTransactionHash locally, call the facade execute
 * 4. Return result to dApp
 *
 * The extension always signs locally with the in-memory private key. There is no
 * signing relay — all dApp RPC flows through the facade using the backend Bearer token.
 */
async function handlePrepareExecute(params: unknown): Promise<null> {
  if (!getGatewayFacadeBaseUrl()) {
    throw new RpcError(RpcErrorCodes.RESOURCE_UNAVAILABLE, 'Wallet facade not configured for this network');
  }

  const { partyId, isReady } = await getWalletState();
  if (!isReady || !partyId) throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Wallet must be unlocked and onboarded');

  const typedParams = params as PrepareExecuteParams;

  // 1. Forward to the facade dApp API
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
  const { approved, password } = await requestApproval('prepareExecute', 'dApp', {
    transactionId,
    commandId,
    commands: typedParams.commands,
  });

  if (!approved) {
    // Clean up the pending transaction from the facade
    try {
      await gatewayFacadeUserRpc('deleteTransaction', { transactionId });
    } catch {
      // Best-effort cleanup
    }
    throw new RpcError(RpcErrorCodes.USER_REJECTED, 'User rejected the transaction');
  }
  if (!password) {
    throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Password required to sign');
  }

  // 4. Get prepared transaction details from the facade
  const tx = await gatewayFacadeUserRpc<GatewayTransaction>('getTransaction', { transactionId });

  // 5. Sign locally, decrypting the key on demand with the approval password.
  const { signature } = await signHashWithPassword(password, partyId, tx.preparedTransactionHash);
  const fingerprint = partyId.split('::')[1];

  // 6. Execute via the facade. Result is discarded — the spec defines
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

  const typedParams = params as PrepareExecuteParams;

  const { userUrl } = await gatewayFacadeDappRpc<PrepareExecuteResponse>('prepareExecute', typedParams);

  const url = new URL(userUrl);
  const transactionId = url.searchParams.get('transactionId');
  const commandId = url.searchParams.get('commandId');
  if (!transactionId) throw new RpcError(RpcErrorCodes.INTERNAL_ERROR, 'No transactionId in Gateway response');
  if (!commandId) throw new RpcError(RpcErrorCodes.INTERNAL_ERROR, 'No commandId in Gateway response');

  const { approved, password } = await requestApproval('prepareExecuteAndWait', 'dApp', {
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
  if (!password) {
    throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Password required to sign');
  }

  const tx = await gatewayFacadeUserRpc<GatewayTransaction>('getTransaction', { transactionId });

  const { signature } = await signHashWithPassword(password, partyId, tx.preparedTransactionHash);
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
 * ledgerApi: Proxy to the backend's Ledger API via the CIP-0103 facade.
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

type DappCtx = { password?: string };
type MethodHandler = (params?: unknown, ctx?: DappCtx) => Promise<unknown>;

const methods: Record<string, MethodHandler> = {
  connect: handleConnect,
  disconnect: handleDisconnect,
  isConnected: handleIsConnected,
  status: handleStatus,
  getActiveNetwork: handleGetActiveNetwork,
  listAccounts: handleListAccounts,
  getPrimaryAccount: handleGetPrimaryAccount,
  signMessage: handleSignMessage,
  // Extension method, NOT in CIP-0103 — see JSDoc on handleSignTransaction.
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
  let approvalPassword: string | undefined;
  if (APPROVAL_REQUIRED_METHODS.has(method)) {
    const origin = senderOrigin || 'Unknown origin';
    const { approved, password } = await requestApproval(method, origin, request.params);
    if (!approved) {
      return jsonRpcError(id, RpcErrorCodes.USER_REJECTED, 'User rejected the request');
    }
    approvalPassword = password;
  }

  try {
    const result = await handler(request.params, { password: approvalPassword });
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
