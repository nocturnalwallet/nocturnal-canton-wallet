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
    apiBaseUrl: 'https://api.kairo.ag/',
    explorerUrl: 'https://lighthouse.cantonloop.com',
    faucetEnabled: false,
  },
};

export const DEFAULT_NETWORK: NetworkId = 'devnet';

export const NETWORK_IDS = Object.keys(NETWORKS) as NetworkId[];

/**
 * Convert an internal NetworkId to a CAIP-2-compliant identifier for the
 * CIP-0103 dApp API surface. The canonical Network schema mandates a CAIP-2
 * chain ID like `canton:da-mainnet` (openrpc-dapp-api.json:791-816). Internal
 * wallet code keeps the bare ID (`'localnet'`, `'devnet'`, ...) because it's
 * embedded in chrome.storage.local keys, React Query cache keys, popup state,
 * and the user-facing network picker — changing the internal form would force
 * a storage migration for every installed user. We convert only at the dApp
 * API boundary (handleGetActiveNetwork, handleStatus.network, buildDappAccount).
 */
export function toCaip2NetworkId(id: NetworkId): string {
  return `canton:${id}`;
}
