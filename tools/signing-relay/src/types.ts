/**
 * Types for the signing relay service.
 *
 * The HTTP API types match the Blockdaemon signing provider contract
 * defined in splice-wallet-kernel/core/signing-lib/src/rpc-gen/typings.ts
 */

// -- Blockdaemon-compatible HTTP API types --

export interface KeyIdentifier {
  publicKey?: string;
  id?: string;
}

export interface SignTransactionRequest {
  tx: string;
  txHash: string;
  keyIdentifier: KeyIdentifier;
  publicKey?: string;
  internalTxId?: string;
  masterKey?: string;
  testNetwork?: boolean;
}

export type SigningStatus = 'pending' | 'signed' | 'rejected' | 'failed';

export interface Transaction {
  txId: string;
  status: SigningStatus;
  signature?: string;
  publicKey?: string;
  metadata?: Record<string, unknown>;
}

export interface GetTransactionRequest {
  txId: string;
}

export interface GetTransactionsRequest {
  txIds?: string[];
  publicKeys?: string[];
}

export interface Key {
  id: string;
  name: string;
  publicKey: string;
}

export interface CreateKeyRequest {
  name: string;
}

// -- Socket.io event types --

export interface RegisterKeysPayload {
  keys: Key[];
}

export interface SignRequestPayload {
  txId: string;
  tx: string;
  txHash: string;
  keyIdentifier: KeyIdentifier;
  internalTxId?: string;
}

export interface SignResponsePayload {
  txId: string;
  signature: string | null;
  publicKey: string | null;
  status: SigningStatus;
}

export interface SocketAuth {
  partyId: string;
  token?: string;
}

// -- Internal state --

export interface PendingRequest {
  resolve: (tx: Transaction) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}
