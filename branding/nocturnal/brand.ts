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
  // Aligned to the Chrome Web Store item's public key so the unpacked (local
  // dev) ID matches the published ID: kipdkhhnfoggaalehloecmmlhpmbpkjk.
  // OAuth redirect URI: https://kipdkhhnfoggaalehloecmmlhpmbpkjk.chromiumapp.org/
  manifestKey:
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtdsYJImRgGzoUDWEsEeu9D/cT+0+kmnf1vQ5LkBSZ7xPiviqhnhagFdG/ut/iGIq/x1K/XHHRgVy0+TWjdgVLQMtmHINVs0DSCovHtJz+z6fB6AMgDMKSsRxFIKj08uYeUIG/NlJJiZipZ9C1fxllmwMcfUzmC43RSycUWehffi7nTH/Lx4Fgcs9htrYAwjEZtdnWlw0zoaK6VXMAQOn13/qi6UvDnTB0TDDW1oW6SpbkQq0DxvRx45Q16SbhTvXIJSejLfnzSlW26IRybdcPs1RGSjBhkrf52VlpCuqGWNNt31Fxp0fVLvjW4FyzSOc1w7aEt3Wu42gjRrv8YM50wIDAQAB',
  hostPermissions: [
    'https://wallet-api.nocturnal.xyz/*',
    'https://wallet-api-devnet.nocturnal.xyz/*',
  ],
  // Nocturnal has no testnet environment; a public preview build ships
  // devnet + mainnet, and lands on mainnet (see resolveDefaultNetwork).
  enabledNetworks: ['devnet', 'mainnet'],
  networkApiBaseUrls: {
    localnet: 'http://localhost:3008/',
    devnet: 'https://wallet-api-devnet.nocturnal.xyz/',
    testnet: 'https://api-testnet.donot.used/',
    mainnet: 'https://wallet-api.nocturnal.xyz/',
  },
  welcomeBackgroundUrl: '/bg/skyline.jpg',
};

export default brand;
