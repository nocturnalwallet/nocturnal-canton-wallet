import type { BrandConfig } from '../types';

const brand: BrandConfig = {
  id: 'nocturnal',
  displayName: 'Nocturnal',
  packageName: 'nocturnal-wallet',
  description:
    'Nocturnal — Canton Network wallet browser extension with CIP-0103 dApp API support',
  providerId: 'nocturnal',
  providerName: 'Nocturnal',
  partyHintDefault: 'nocturnal-wallet',
  logTag: '[Nocturnal]',
  version: '0.5.0',
  manifestKey:
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAm+5/uaDpKxZpz4vZ+EwkLhbehAa+8OSwC28pacF6YoEveydmZo0g6GmRUIGZFf3BT1LcJlRhMu/EUsTZYWWy485HdxWI9MXJYWD4F+95wQCbze/qqvIWXSyNBAAfydB/4XllAiGttoEmefInRinjjRPrvADtAEEraUANS8M4C3xwYPMIG9OQWIn/BY/m4r5pcgzBEZ+vHXaFbcapFO36j7cLO/fXyST8pkyyUtorjAnDgkiyamo5Y3LpZcVvpA2xCZuOo9zfKLpT5UMQnYjuNhBYW+7oVBRwmvPiG1SVNRk+JQaQPsUeQplr+52s0NVl/5CQFeqgT41T+6iD2/4rwwIDAQAB',
  hostPermissions: ['https://*.thanhle.space/*'],
  // Nocturnal has no testnet environment; a public preview build ships
  // devnet + mainnet, and lands on mainnet (see resolveDefaultNetwork).
  enabledNetworks: ['devnet', 'mainnet'],
  networkApiBaseUrls: {
    localnet: 'http://localhost:3008/',
    devnet: 'https://api-mpch-wallet-provider-devnet.thanhle.space/',
    testnet: 'https://api-testnet.donot.used/',
    mainnet: 'https://api-mpch-wallet-provider.thanhle.space/',
  },
  welcomeBackgroundUrl: '/bg/skyline.jpg',
};

export default brand;
