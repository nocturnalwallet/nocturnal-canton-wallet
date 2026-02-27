/**
 * CIP-0103 dApp API types for Ginkgo wallet extension.
 *
 * Minimal inline definitions matching @canton-network/core-types SpliceMessage format.
 * This avoids pulling in the full @canton-network/core-types package and its transitive
 * dependencies (which may conflict with the extension's existing Zod version).
 */

// -- WalletEvent enum (matches @canton-network/core-types WalletEvent) --

export enum WalletEvent {
  SPLICE_WALLET_REQUEST = 'SPLICE_WALLET_REQUEST',
  SPLICE_WALLET_RESPONSE = 'SPLICE_WALLET_RESPONSE',
  SPLICE_WALLET_EXT_READY = 'SPLICE_WALLET_EXT_READY',
  SPLICE_WALLET_EXT_ACK = 'SPLICE_WALLET_EXT_ACK',
  SPLICE_WALLET_EXT_OPEN = 'SPLICE_WALLET_EXT_OPEN',
  SPLICE_WALLET_EVENT = 'SPLICE_WALLET_EVENT',
}

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

export type SpliceMessage =
  | { type: WalletEvent.SPLICE_WALLET_REQUEST; request: JsonRpcRequest }
  | { type: WalletEvent.SPLICE_WALLET_RESPONSE; response: JsonRpcResponse }
  | { type: WalletEvent.SPLICE_WALLET_EXT_READY }
  | { type: WalletEvent.SPLICE_WALLET_EXT_ACK }
  | { type: WalletEvent.SPLICE_WALLET_EXT_OPEN; url: string }
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

// Standard JSON-RPC / EIP-1193 error codes
export const RpcErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  USER_REJECTED: 4001,
  UNAUTHORIZED: 4100,
  UNSUPPORTED_METHOD: 4200,
  DISCONNECTED: 4900,
  CHAIN_DISCONNECTED: 4901,
} as const;
