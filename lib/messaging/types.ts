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
  | { action: typeof MSG.RESET_KEYSTORE_FOR_RECOVERY }
  // Transfer pre-approval
  | { action: typeof MSG.REGISTER_TRANSFER_PREAPPROVAL }
  | { action: typeof MSG.GET_PREAPPROVAL_STATUS }
  | { action: typeof MSG.MAYBE_AUTO_REGISTER_PREAPPROVAL }
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
  | { action: typeof MSG.FETCH_ELFA_TRENDING_TOKENS }
  | { action: typeof MSG.FETCH_ELFA_TOKEN_NEWS }
  | { action: typeof MSG.FETCH_ELFA_NARRATIVES }
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
  keyMismatch: boolean;
  shouldAutoRegisterPreapproval: boolean;
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

// ── Elfa market intelligence (Phase 1, native data proxied via backend) ──

export interface ElfaTrendingToken {
  token: string;
  current_count: number;
  previous_count: number;
  change_percent: number;
}

export interface ElfaTrendingTokensData {
  total: number;
  page: number;
  pageSize: number;
  data: ElfaTrendingToken[];
}

export interface ElfaNewsItem {
  tweetId: string;
  link: string;
  likeCount: number;
  repostCount: number;
  viewCount: number;
  mentionedAt: string;
  type: string;
  account: { username: string; isVerified: boolean };
}

/** token-news returns a bare array of mention items (no tweet text). */
export type ElfaTokenNewsData = ElfaNewsItem[];

export interface ElfaNarrative {
  narrative?: string;
  theme?: string;
  /** URLs of the posts that evidence this narrative. */
  source_links?: string[];
  tweet_ids?: string[];
  [key: string]: unknown;
}

export interface ElfaNarrativesData {
  trending_narratives: ElfaNarrative[];
  metadata?: unknown;
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

export interface AutoRegisterPreapprovalData {
  attempted: boolean;
  registered: boolean;
  reason?: string;
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
