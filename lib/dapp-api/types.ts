/**
 * CIP-0103 dApp API types for the wallet extension.
 *
 * Minimal inline definitions matching @canton-network/core-types SpliceMessage format.
 * This avoids pulling in the full @canton-network/core-types package and its transitive
 * dependencies (which may conflict with the extension's existing Zod version).
 */

import brand from '@brand/brand';

// -- WalletEvent enum (matches @canton-network/core-types WalletEvent) --

export enum WalletEvent {
  SPLICE_WALLET_REQUEST = 'SPLICE_WALLET_REQUEST',
  SPLICE_WALLET_RESPONSE = 'SPLICE_WALLET_RESPONSE',
  SPLICE_WALLET_EXT_READY = 'SPLICE_WALLET_EXT_READY',
  SPLICE_WALLET_EXT_ACK = 'SPLICE_WALLET_EXT_ACK',
  SPLICE_WALLET_EXT_OPEN = 'SPLICE_WALLET_EXT_OPEN',
  // Auth flow envelopes — accepted/parsed but unused (extension holds keys
  // locally, no IdP login flow). Listed in upstream core-types/index.ts:70-81.
  SPLICE_WALLET_IDP_AUTH_SUCCESS = 'SPLICE_WALLET_IDP_AUTH_SUCCESS',
  SPLICE_WALLET_LOGOUT = 'SPLICE_WALLET_LOGOUT',
  // Wallet→dApp event channel (not in upstream spec).
  // Used by entrypoints/background/handlers/event-broadcaster.ts to push
  // statusChanged/accountsChanged.
  SPLICE_WALLET_EVENT = 'SPLICE_WALLET_EVENT',
}

// -- EIP-6963-style provider discovery --
//
// Constants and detail shape mirror @canton-network/core-types and the
// upstream SDK's `requestAnnouncedProviders` consumer. dApps fire REQUEST,
// extensions reply with ANNOUNCE carrying { id, name, icon?, target? }.
// Inlined (vs. imported from core-types) for the same Zod-version reason
// documented at the top of this file; revisit when that constraint lifts.

export const CANTON_REQUEST_PROVIDER_EVENT = 'canton:requestProvider';
export const CANTON_ANNOUNCE_PROVIDER_EVENT = 'canton:announceProvider';

/**
 * Display name surfaced to multi-wallet pickers. Mirrors the WXT manifest's
 * `name` field (from the active brand pack).
 */
export const PROVIDER_NAME = brand.providerName;

// -- JSON-RPC 2.0 types --

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

// -- SpliceMessage discriminated union --

/**
 * `target` is an optional routing key set by the dApp when multiple Canton
 * wallet extensions are installed. Per upstream convention (splice-wallet-kernel
 * content-script.ts), wallets compare it to their own chrome.runtime.id and
 * ignore messages whose target doesn't match. EXT_ACK echoes the target back
 * so dApps can correlate which wallet replied.
 */
export type SpliceMessage =
  | { type: WalletEvent.SPLICE_WALLET_REQUEST; request: JsonRpcRequest; target?: string }
  | { type: WalletEvent.SPLICE_WALLET_RESPONSE; response: JsonRpcResponse }
  | { type: WalletEvent.SPLICE_WALLET_EXT_READY; target?: string }
  | { type: WalletEvent.SPLICE_WALLET_EXT_ACK; target?: string }
  | { type: WalletEvent.SPLICE_WALLET_EXT_OPEN; url: string; target?: string }
  | { type: WalletEvent.SPLICE_WALLET_IDP_AUTH_SUCCESS; token: string; sessionId: string }
  | { type: WalletEvent.SPLICE_WALLET_LOGOUT }
  | { type: WalletEvent.SPLICE_WALLET_EVENT; event: string; data: unknown };

export type SpliceMessageEvent = MessageEvent<SpliceMessage>;

// -- Type guards --

const VALID_TYPES = new Set<string>(Object.values(WalletEvent));

export function isSpliceMessage(message: unknown): message is SpliceMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof (message as { type: unknown }).type === 'string' &&
    VALID_TYPES.has((message as { type: string }).type)
  );
}

// -- Response helpers --

export function jsonRpcSuccess(
  id: string | number | null,
  result: unknown,
): SpliceMessage {
  return {
    type: WalletEvent.SPLICE_WALLET_RESPONSE,
    response: { jsonrpc: '2.0', id, result },
  };
}

export function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): SpliceMessage {
  return {
    type: WalletEvent.SPLICE_WALLET_RESPONSE,
    response: { jsonrpc: '2.0', id, error: { code, message, data } },
  };
}

/** Build an event push message to forward to connected dApps. */
export function walletEvent(event: string, data: unknown): SpliceMessage {
  return {
    type: WalletEvent.SPLICE_WALLET_EVENT,
    event,
    data,
  };
}

// Standard JSON-RPC / EIP-1193 / CIP-0103 error codes
export const RpcErrorCodes = {
  // JSON-RPC 2.0 reserved range
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // CIP-0103 application-defined codes (-32000 to -32099)
  INVALID_INPUT: -32000,
  RESOURCE_NOT_FOUND: -32001,
  RESOURCE_UNAVAILABLE: -32002,
  TRANSACTION_REJECTED: -32003,
  METHOD_NOT_SUPPORTED: -32004,
  LIMIT_EXCEEDED: -32005,
  // EIP-1193 provider codes
  USER_REJECTED: 4001,
  UNAUTHORIZED: 4100,
  UNSUPPORTED_METHOD: 4200,
  DISCONNECTED: 4900,
  CHAIN_DISCONNECTED: 4901,
} as const;

/**
 * Typed error for dApp API handlers. Carries a JSON-RPC error code so the
 * dispatcher in handleDappApiRequest can preserve it on the wire instead of
 * collapsing every throw to INTERNAL_ERROR (-32603).
 *
 * Handlers should throw RpcError with the most specific code; the catch-all
 * stays INTERNAL_ERROR for unexpected throws (storage failures, etc.).
 */
export class RpcError extends Error {
  readonly code: number;
  readonly data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
}
