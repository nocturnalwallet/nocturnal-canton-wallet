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
  | { action: typeof MSG.FETCH_ELFA_TRENDING_TOKENS; payload: { window: ElfaTimeWindow } }
  | { action: typeof MSG.FETCH_ELFA_NARRATIVES; payload: { window: ElfaTimeWindow } }
  | { action: typeof MSG.FETCH_ELFA_TOP_MENTIONS; payload: { ticker: string } }
  | { action: typeof MSG.FETCH_ELFA_KEYWORD_MENTIONS; payload: { keywords: string } }
  | { action: typeof MSG.FETCH_ELFA_SMART_STATS; payload: { username: string } }
  // dApp approval flow
  | { action: typeof MSG.GET_DAPP_APPROVAL; payload: { requestId: string } }
  | { action: typeof MSG.DAPP_APPROVAL_RESULT; payload: { requestId: string; approved: boolean } };

// ── Response types ──

export type MessageResponse<T = unknown> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      status?: number;
      retryAfterSeconds?: number;
    };

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

/** Rolling window offered in the UI; mapped to Elfa params server-side
 *  (timeWindow for tokens/news, timeFrame day|week for narratives). */
export type ElfaTimeWindow = '24h' | '7d';

export interface ElfaTrendingToken {
  token: string;
  current_count: number;
  previous_count: number;
  change_percent: number;
}

/** Canton Coin row injected server-side (Elfa doesn't track CC). */
export interface ElfaCantonCoin {
  token: string;
  label: string;
  priceUsd: string;
}

export interface ElfaTrendingTokensData {
  total: number;
  page: number;
  pageSize: number;
  data: ElfaTrendingToken[];
  canton?: ElfaCantonCoin | null;
}

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

/** A social mention. Shared shape for top-mentions and keyword-mentions
 *  (top-mentions may omit `account`). */
export interface ElfaMention {
  tweetId: string;
  link: string;
  likeCount?: number;
  repostCount?: number;
  viewCount?: number;
  mentionedAt: string;
  type?: string;
  account?: { username: string; isVerified: boolean };
}

export type ElfaTopMentionsData = ElfaMention[];
export type ElfaKeywordMentionsData = ElfaMention[];

export interface ElfaSmartStats {
  smartFollowingCount: number;
  smartFollowerCount: number;
  averageEngagement: number;
  averageReach: number;
  followerCount: number;
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
