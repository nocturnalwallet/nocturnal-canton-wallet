export interface PrepareTransferProps {
  receiverPartyId: string;
  amount: string | number;
  reason: string;
}

export interface PrepareTransferResponse {
  preparedTransaction: string;
  preparedTransactionHash: string;
  hashingSchemeVersion: string;
}

export interface PrepareTransferTokenStandardProps {
  assetId: string;
  assetAmount: string;
  receiverPartyId: string;
  reason: string;
  maxTimeToExecute: number;
}

export interface PrepareTransferTokenStandardResponse {
  hashingSchemeVersion: string;
  preparedTransaction: string;
  preparedTransactionHash: string;
}
