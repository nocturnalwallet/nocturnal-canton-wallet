/**
 * TypeScript types for Wallet Gateway JSON-RPC interactions.
 *
 * These match the Gateway's dApp API and User API request/response shapes
 * as defined in splice-wallet-kernel.
 */

/** Parameters for the `prepareExecute` dApp API method. */
export interface PrepareExecuteParams {
  commandId?: string;
  commands: Record<string, unknown>;
  actAs?: string[];
  readAs?: string[];
  disclosedContracts?: DisclosedContract[];
  synchronizerId?: string;
  packageIdSelectionPreference?: string[];
}

export interface DisclosedContract {
  templateId?: string;
  contractId?: string;
  createdEventBlob: string;
  synchronizerId?: string;
}

/** Response from the `prepareExecute` dApp API method. */
export interface PrepareExecuteResponse {
  userUrl: string;
}

/** Parameters for the `ledgerApi` dApp API method. */
export interface LedgerApiParams {
  requestMethod: 'GET' | 'POST' | 'PUT' | 'DELETE';
  resource: string;
  body?: string;
}

/** A transaction stored by the Gateway. */
export interface GatewayTransaction {
  commandId: string;
  status: 'pending' | 'signed' | 'executed' | 'failed' | 'rejected';
  preparedTransaction: string;
  preparedTransactionHash: string;
  payload?: string;
  origin?: string;
}

/** Parameters for the Gateway User API `execute` method. */
export interface ExecuteParams {
  commandId: string;
  signature: string;
  signedBy: string;
  partyId: string;
}

/** Result returned by `prepareExecuteAndWait`. */
export interface PrepareExecuteAndWaitResult {
  tx: {
    status: string;
    commandId: string;
    payload?: unknown;
  };
}

/** Parameters for the Gateway User API `createWallet` method. */
export interface CreateWalletParams {
  partyHint: string;
  signingProviderId: string;
  primary?: boolean;
  signingProviderContext?: Record<string, unknown>;
}

/** Result returned by `createWallet`. */
export interface CreateWalletResult {
  wallet: {
    primary: boolean;
    partyId: string;
    status: 'initialized' | 'allocated';
    hint: string;
    publicKey: string;
    namespace: string;
    networkId: string;
    signingProviderId: string;
  };
}
