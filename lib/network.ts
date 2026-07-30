export type NetworkId = 'localnet' | 'devnet' | 'testnet' | 'mainnet';

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  /** Backend base URL — serves both REST (`/auth/*`, `/transfer-offer/*`) and JSON-RPC facade (`/api/v0/{dapp,user}`). */
  apiBaseUrl: string;
  explorerUrl: string;
  faucetEnabled: boolean;
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  localnet: {
    id: 'localnet',
    label: 'Local Devnet',
    apiBaseUrl: 'http://localhost:3003/',
    // apiBaseUrl: 'http://192.168.0.108:3003/',
    explorerUrl: 'https://lighthouse.devnet.cantonloop.com',
    faucetEnabled: true,
  },
  devnet: {
    id: 'devnet',
    label: 'Devnet',
    apiBaseUrl: 'https://api-devnet.kairo.ag/',
    explorerUrl: 'https://lighthouse.devnet.cantonloop.com',
    faucetEnabled: true,
  },
  testnet: {
    id: 'testnet',
    label: 'Testnet',
    apiBaseUrl: 'https://api-testnet.kairo.ag/',
    explorerUrl: 'https://lighthouse.testnet.cantonloop.com',
    faucetEnabled: false,
  },
  mainnet: {
    id: 'mainnet',
    label: 'Mainnet',
    apiBaseUrl: 'https://nexu-wallet-gateway-provider.thanhle.space/',
    explorerUrl: 'https://lighthouse.cantonloop.com',
    faucetEnabled: false,
  },
};

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

export const DEFAULT_NETWORK: NetworkId = IS_MAINNET_ONLY_BUILD
  ? 'mainnet'
  : 'devnet';

/**
 * Networks exposed to the UI picker and accepted by the network-switch handler.
 * In a Mainnet-only production build this is `['mainnet']`; otherwise all
 * networks. `NETWORKS` itself always keeps every entry so lookups by id
 * (`NETWORKS[id]`) stay total.
 */
export const NETWORK_IDS: NetworkId[] = IS_MAINNET_ONLY_BUILD
  ? ['mainnet']
  : ALL_NETWORK_IDS;

/**
 * Convert an internal NetworkId to a CAIP-2-compliant identifier for the
 * CIP-0103 dApp API surface. The canonical Network schema mandates a CAIP-2
 * chain ID (the spec's own example is `canton:da-mainnet`, openrpc-dapp-api.json:791-816);
 * this function emits `canton:<id>` from our internal ids, e.g. `canton:mainnet` /
 * `canton:devnet`. Internal wallet code keeps the bare ID (`'localnet'`, `'devnet'`, ...) because it's
 * embedded in chrome.storage.local keys, React Query cache keys, popup state,
 * and the user-facing network picker — changing the internal form would force
 * a storage migration for every installed user. We convert only at the dApp
 * API boundary (handleGetActiveNetwork, handleStatus.network, buildDappAccount).
 */
export function toCaip2NetworkId(id: NetworkId): string {
  return `canton:${id}`;
}
