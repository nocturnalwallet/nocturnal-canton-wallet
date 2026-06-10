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
    label: 'Localnet',
    apiBaseUrl: 'http://localhost:3003/',
    explorerUrl: '',
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
