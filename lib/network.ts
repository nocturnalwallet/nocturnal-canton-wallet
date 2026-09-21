import brand from '@brand/brand';

export type NetworkId = 'localnet' | 'devnet' | 'testnet' | 'mainnet';

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  /** Backend base URL — serves both REST (`/auth/*`, `/transfer-offer/*`) and JSON-RPC facade (`/api/v0/{dapp,user}`). */
  apiBaseUrl: string;
  explorerUrl: string;
  faucetEnabled: boolean;
}

/** Shared network metadata; apiBaseUrl comes from the active brand pack. */
const NETWORK_BASE: Record<
  NetworkId,
  Omit<NetworkConfig, 'apiBaseUrl'> & { apiBaseUrl?: string }
> = {
  localnet: {
    id: 'localnet',
    label: 'Local Devnet',
    explorerUrl: 'https://lighthouse.devnet.cantonloop.com',
    faucetEnabled: true,
  },
  devnet: {
    id: 'devnet',
    label: 'Devnet',
    explorerUrl: 'https://lighthouse.devnet.cantonloop.com',
    faucetEnabled: true,
  },
  testnet: {
    id: 'testnet',
    label: 'Testnet',
    explorerUrl: 'https://lighthouse.testnet.cantonloop.com',
    faucetEnabled: false,
  },
  mainnet: {
    id: 'mainnet',
    label: 'Mainnet',
    explorerUrl: 'https://lighthouse.cantonloop.com',
    faucetEnabled: false,
  },
};

function buildNetworks(): Record<NetworkId, NetworkConfig> {
  const urls = brand.networkApiBaseUrls;
  const ids = Object.keys(NETWORK_BASE) as NetworkId[];
  const result = {} as Record<NetworkId, NetworkConfig>;
  for (const id of ids) {
    const apiBaseUrl = urls[id];
    if (!apiBaseUrl) {
      throw new Error(
        `Brand "${brand.id}" is missing networkApiBaseUrls.${id}`,
      );
    }
    result[id] = { ...NETWORK_BASE[id], apiBaseUrl };
  }
  return result;
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = buildNetworks();

/**
 * Production (Mainnet-only) build flag. `yarn build:prod` runs
 * `wxt build --mode mainnet`, which loads `.env.mainnet` and sets
 * `VITE_MAINNET_ONLY=true`. In this mode the wallet restricts itself to
 * Mainnet only; every other build (dev, plain `yarn build`) never loads that
 * env file, so the flag is absent and all networks stay available for testing.
 *
 * (WXT's `--mode` selects which `.env.<mode>` file loads but does NOT change
 * `import.meta.env.MODE`, so gating goes through a dedicated VITE_ var.)
 *
 * Note the safe default: the restriction activates ONLY when the flag is
 * explicitly `'true'`, so a missing flag degrades to all-networks — a dev
 * build can never accidentally lock itself to Mainnet.
 */
export const IS_MAINNET_ONLY_BUILD =
  import.meta.env.VITE_MAINNET_ONLY === 'true';

const ALL_NETWORK_IDS = Object.keys(NETWORKS) as NetworkId[];

/**
 * Derive the set of networks a build exposes from the brand's optional
 * `enabledNetworks` allowlist:
 * - Mainnet-only build (`--mode mainnet`) → always `['mainnet']`, ignoring the
 *   allowlist, so the production/store build can never widen itself.
 * - No allowlist (brand omits `enabledNetworks`) → all networks (dev default).
 * - Allowlist set → exactly that list, validated: it must be non-empty and
 *   contain only known network ids (fail fast at module load, mirroring the
 *   missing-apiBaseUrl guard in `buildNetworks`).
 *
 * `NETWORKS` itself always keeps every entry so lookups by id
 * (`NETWORKS[id]`) stay total even when a network is not exposed.
 */
export function resolveEnabledNetworkIds(
  enabled: NetworkId[] | undefined,
  allIds: NetworkId[],
  mainnetOnly: boolean,
): NetworkId[] {
  if (mainnetOnly) return ['mainnet'];
  if (enabled === undefined) return allIds;
  if (enabled.length === 0) {
    throw new Error('Brand enabledNetworks must not be empty when set');
  }
  for (const id of enabled) {
    if (!allIds.includes(id)) {
      throw new Error(
        `Brand enabledNetworks contains unknown network "${id}"`,
      );
    }
  }
  return enabled;
}

/**
 * Pick the landing network for a build:
 * - Mainnet-only build → `'mainnet'`.
 * - No allowlist → `'devnet'` (preserves the historical dev default).
 * - Allowlist set → `'mainnet'` if it is exposed, else the first exposed
 *   network (so brands can control the fallback via list order).
 */
export function resolveDefaultNetwork(
  enabled: NetworkId[] | undefined,
  ids: NetworkId[],
  mainnetOnly: boolean,
): NetworkId {
  if (mainnetOnly) return 'mainnet';
  if (enabled === undefined) return 'devnet';
  return ids.includes('mainnet') ? 'mainnet' : ids[0];
}

/**
 * Networks exposed to the UI picker and accepted by the network-switch handler.
 * In a Mainnet-only production build this is `['mainnet']`; otherwise the
 * brand's `enabledNetworks` allowlist, or all networks when the brand omits it.
 */
export const NETWORK_IDS: NetworkId[] = resolveEnabledNetworkIds(
  brand.enabledNetworks,
  ALL_NETWORK_IDS,
  IS_MAINNET_ONLY_BUILD,
);

export const DEFAULT_NETWORK: NetworkId = resolveDefaultNetwork(
  brand.enabledNetworks,
  NETWORK_IDS,
  IS_MAINNET_ONLY_BUILD,
);

/**
 * Internal NetworkId → CIP-0103 / PartyLayer-recognized CAIP-2 chain IDs.
 * Spec example is `canton:da-mainnet` (openrpc-dapp-api.json:791-816). SDKs such
 * as PartyLayer only treat the `canton:da-*` forms as recognized; emitting
 * `canton:mainnet` caused connect to discard the wallet network and fall back
 * to the dApp Kit preferred network.
 *
 * Internal wallet code keeps the bare ID (`'localnet'`, `'devnet'`, ...) because
 * it's embedded in chrome.storage.local keys, React Query cache keys, popup
 * state, and the user-facing network picker — changing the internal form would
 * force a storage migration. We convert only at the dApp API boundary
 * (handleGetActiveNetwork, handleStatus.network, buildDappAccount).
 */
const NETWORK_ID_TO_CAIP2: Record<NetworkId, string> = {
  localnet: 'canton:da-local',
  devnet: 'canton:da-devnet',
  testnet: 'canton:da-testnet',
  mainnet: 'canton:da-mainnet',
};

export function toCaip2NetworkId(id: NetworkId): string {
  return NETWORK_ID_TO_CAIP2[id];
}

/** Lighthouse explorer deep-link for a ledger update. */
export function transactionExplorerUrl(
  explorerBaseUrl: string,
  updateId: string,
): string {
  const base = explorerBaseUrl.replace(/\/$/, '');
  return `${base}/transactions/${updateId}`;
}
