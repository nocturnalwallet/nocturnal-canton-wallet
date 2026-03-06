export type NetworkId = 'localnet' | 'devnet' | 'testnet' | 'mainnet';

export interface GatewayAuthConfig {
  /** Network ID as registered in the Gateway (e.g. "canton:localnet") */
  networkId: string;
  /** IDP issuer for JWT generation (e.g. "unsafe-auth") */
  idpIssuer: string;
  /** Canton ledger user ID — used as JWT `sub` claim (e.g. "ledger-api-user") */
  clientId: string;
  /** HMAC secret for HS256 JWT signing */
  clientSecret: string;
  /** JWT audience claim */
  audience: string;
  /** JWT scope claim (required by Gateway) */
  scope: string;
}

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  apiBaseUrl: string;
  gatewayUrl: string;
  gatewayAuth?: GatewayAuthConfig;
  signingRelayUrl: string;
  signingRelayApiKey: string;
  explorerUrl: string;
  faucetEnabled: boolean;
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  localnet: {
    id: 'localnet',
    label: 'Localnet',
    apiBaseUrl: 'http://localhost:3003/',
    gatewayUrl: 'http://localhost:3030',
    gatewayAuth: {
      networkId: 'canton:localnet',
      idpIssuer: 'unsafe-auth',
      clientId: 'ledger-api-user',
      clientSecret: 'unsafe',
      audience: 'https://canton.network.global',
      scope: 'openid daml_ledger_api offline_access',
    },
    signingRelayUrl: 'http://localhost:4100',
    signingRelayApiKey: 'dev-relay-key',
    explorerUrl: '',
    faucetEnabled: true,
  },
  devnet: {
    id: 'devnet',
    label: 'Devnet',
    apiBaseUrl: 'https://api-devnet.kairo.ag/',
    gatewayUrl: '',
    signingRelayUrl: '',
    signingRelayApiKey: '',
    explorerUrl: 'https://lighthouse.devnet.cantonloop.com',
    faucetEnabled: true,
  },
  testnet: {
    id: 'testnet',
    label: 'Testnet',
    apiBaseUrl: 'https://api-testnet.kairo.ag/',
    gatewayUrl: '',
    signingRelayUrl: '',
    signingRelayApiKey: '',
    explorerUrl: 'https://lighthouse.testnet.cantonloop.com',
    faucetEnabled: false,
  },
  mainnet: {
    id: 'mainnet',
    label: 'Mainnet',
    apiBaseUrl: 'https://api.kairo.ag/',
    gatewayUrl: '',
    signingRelayUrl: '',
    signingRelayApiKey: '',
    explorerUrl: 'https://lighthouse.cantonloop.com',
    faucetEnabled: false,
  },
};

export const DEFAULT_NETWORK: NetworkId = 'devnet';

export const NETWORK_IDS = Object.keys(NETWORKS) as NetworkId[];
