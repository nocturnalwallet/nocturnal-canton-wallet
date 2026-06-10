import type { MSG } from './constants';
import type { NetworkId, NetworkConfig } from '../network';
import type {
  AboutMeResponse,
  AutoApprovalPrepareResponse,
  TokenBalance,
  GetApproveRequestsResponse,
  GetHistoryRequestsQuery,
  GetIncomingRequestsQuery,
  PrepareTransferProps,
  PrepareTransferResponse,
  PrepareTransferTokenStandardProps,
  PrepareTransferTokenStandardResponse,
  User,
} from '../types';

// ── Request types ──

export type MessageRequest =
  // Auth
  | { action: typeof MSG.GOOGLE_AUTH }
  | { action: typeof MSG.REFRESH_TOKEN }
  | { action: typeof MSG.LOGOUT }
  | { action: typeof MSG.GET_AUTH_STATE }
  // Session
  | { action: typeof MSG.UNLOCK; payload: { password: string } }
  | { action: typeof MSG.LOCK }
  | { action: typeof MSG.GET_LOCK_STATE }
  // Network
  | { action: typeof MSG.GET_NETWORK }
  | { action: typeof MSG.SWITCH_NETWORK; payload: { network: NetworkId } }
  // Keystore
  | { action: typeof MSG.CREATE_KEYPAIR }
  | {
      action: typeof MSG.VALIDATE_IMPORT_KEY;
      payload: { privateKey: string; expectedPublicKey?: string };
    }
  | {
      action: typeof MSG.PREPARE_ONBOARDING;
      payload: { publicKey: string };
    }
  | {
      action: typeof MSG.COMPLETE_ONBOARDING;
      payload: {
        password: string;
        privateKey: string;
        publicKey: string;
      };
    }
  | {
      action: typeof MSG.EXPORT_PRIVATE_KEY;
      payload: { password: string };
    }
  | { action: typeof MSG.DELETE_KEYSTORE }
  // Transfer pre-approval
  | { action: typeof MSG.REGISTER_TRANSFER_PREAPPROVAL }
  | { action: typeof MSG.GET_PREAPPROVAL_STATUS }
  // Signing
  | {
      action: typeof MSG.SIGN_AND_SUBMIT_TRANSFER_PREAPPROVAL;
      payload: {
        password: string;
        preparedData: PrepareTransferResponse;
      };
    }
  | {
      action: typeof MSG.SIGN_AND_SUBMIT_TRANSFER_TOKEN_STANDARD;
      payload: {
        password: string;
        preparedData: PrepareTransferTokenStandardResponse;
      };
    }
  | {
      action: typeof MSG.SIGN_AND_SUBMIT_APPROVE;
      payload: {
        password: string;
        preparedData: PrepareTransferTokenStandardResponse;
      };
    }
  | {
      action: typeof MSG.SIGN_AND_SUBMIT_REJECT;
      payload: {
        password: string;
        preparedData: PrepareTransferTokenStandardResponse;
      };
    }
  | {
      action: typeof MSG.SIGN_AND_SUBMIT_WITHDRAW;
      payload: {
        password: string;
        preparedData: PrepareTransferTokenStandardResponse;
      };
    }
  // API proxy
  | { action: typeof MSG.FETCH_BALANCES }
  | {
      action: typeof MSG.PREPARE_TRANSFER_PREAPPROVAL;
      payload: PrepareTransferProps;
    }
  | {
      action: typeof MSG.PREPARE_TRANSFER_TOKEN_STANDARD;
      payload: PrepareTransferTokenStandardProps;
    }
  | {
      action: typeof MSG.FETCH_INCOMING_OFFERS;
      payload: GetIncomingRequestsQuery;
    }
  | {
      action: typeof MSG.FETCH_OUTGOING_OFFERS;
      payload: GetIncomingRequestsQuery;
    }
  | {
      action: typeof MSG.FETCH_HISTORY_OFFERS;
      payload: GetHistoryRequestsQuery;
    }
  | {
      action: typeof MSG.PREPARE_APPROVE;
      payload: { contractId: string; tokenId: string };
    }
  | {
      action: typeof MSG.PREPARE_REJECT;
      payload: { contractId: string; tokenId: string };
    }
  | {
      action: typeof MSG.PREPARE_WITHDRAW;
      payload: { contractId: string; tokenId: string };
    }
  | { action: typeof MSG.FETCH_ABOUT_ME }
  | { action: typeof MSG.REQUEST_FAUCET; payload: { password: string; amount: string } }
  // dApp approval flow
  | { action: typeof MSG.GET_DAPP_APPROVAL; payload: { requestId: string } }
  | { action: typeof MSG.DAPP_APPROVAL_RESULT; payload: { requestId: string; approved: boolean } };

// ── Response types ──

export type MessageResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

// ── Response data by action ──

export interface NetworkData {
  network: NetworkId;
  config: NetworkConfig;
}

export interface AuthStateData {
  isAuthenticated: boolean;
  user: User | null;
  partyId: string | null;
  onboardingComplete: boolean;
}

export interface GoogleAuthData {
  token: string;
  user: User;
  partyId: string;
  partyStatus: 'PENDING' | 'SUCCESSFULLY' | 'DEACTIVATED';
  publicKey: string;
  onboardingComplete: boolean;
}

export interface LockStateData {
  unlocked: boolean;
}

export interface KeyPairData {
  privateKey: string;
  publicKey: string;
}

export interface BalancesData {
  balances: TokenBalance[];
}

export interface PaginatedOffersData {
  data: GetApproveRequestsResponse[];
  page: number;
  total: number;
  totalPages: number;
  has_next: boolean;
  has_previous: boolean;
}


export interface AboutMeData {
  aboutMe: AboutMeResponse;
}

export interface PrepareData {
  preparedData: PrepareTransferResponse | PrepareTransferTokenStandardResponse | AutoApprovalPrepareResponse;
}

export interface PreapprovalStatusData {
  hasPreapproval: boolean;
}

export interface OnboardingPrepareData {
  partyId: string;
  namespace: string;
  multiHash: string;
  topologyTransactions: string[];
}

export interface DappApprovalData {
  requestId: string;
  method: string;
  origin: string;
  params?: unknown;
}
