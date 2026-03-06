export interface SubmitApproveProps {
  preparedTransaction: string;
  signature: string;
}

export interface SubmitRejectProps {
  preparedTransaction: string;
  signature: string;
}

export interface GetApproveRequestsResponse {
  amount: string;
  contractId: string;
  instrumentId?: {
    admin: string;
    id: string;
  };
  instrument: string;
  operator: string;
  provider: string;
  receiver: string;
  reference: string;
  registrar: string;
  sender: string;
  state: string;
  updatedAt: string;
  createdAt: string;
  tokenName: string;
  status: 'LOCKED' | 'CANCELLED' | 'REJECTED' | 'APPROVED';
  requestedAt?: string;
  executeBefore?: string;
}

export interface GetIncomingRequestsQuery {
  page: number;
  limit: number;
  tokenName?: string;
}

export interface GetHistoryRequestsQuery {
  page: number;
  limit: number;
  sender?: string;
  receiver?: string;
  tokenName?: string;
  status?: 'LOCKED' | 'CANCELLED' | 'REJECTED' | 'APPROVED';
}
