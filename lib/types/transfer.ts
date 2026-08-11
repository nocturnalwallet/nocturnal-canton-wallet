export interface PrepareTransferProps {
  receiverPartyId: string;
  amount: string | number;
  reason: string;
}

/** Display subset of backend FeeLine (kairo traffic-fee.types.ts). */
export interface FeeLine {
  description: string;
  amount: string;
  receiverPartyId: string;
  type: string | null;
}

/** Display subset of backend FeeBlock. Collection-path fields omitted. */
export interface FeeBlock {
  currency: string;
  fees: FeeLine[];
  totalFee: string;
  costEstimation?: {
    confirmationRequestBytes: number;
    confirmationResponseBytes: number;
    rateUsdPerMb: string;
    amuletPriceUsd: string;
    trafficBufferBps: string;
    networkFeeAmulet: string;
  };
}

export interface PrepareTransferResponse {
  preparedTransaction: string;
  preparedTransactionHash: string;
  hashingSchemeVersion: string;
  fee?: FeeBlock;
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
  fee?: FeeBlock;
}
