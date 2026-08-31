import type { BrandConfig } from '../types';

const brand: BrandConfig = {
  id: 'ginkgo',
  displayName: 'Ginkgo',
  packageName: 'ginkgo-wallet',
  description:
    'Ginkgo — Canton Network wallet browser extension with CIP-0103 dApp API support',
  providerId: 'ginkgo',
  providerName: 'Ginkgo',
  partyHintDefault: 'ginkgo-wallet',
  logTag: '[Ginkgo]',
  version: '0.7.0',
  manifestKey:
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1wm7Jt0cFnGf9ecUzFcSNx2NjY6ayMNQw8d4xgjW41L5ue7FRcODaFWngjxsdgiomU01LMgGHRD5eLbM7mi/iqKs0jYKooKRQk5TaDnZyAHtluDTzeCLBa+QXBJbx3qC88vWRSoDkmEIq6EQ0KlAk3o120IXRY6UYdn6TXXvqLo4vhWya8WfBTLorQtJJo7ByghgIFXDkSYiAvaSeiPAf2bxGU8l+HXJHIYouKECJHPoBW3CB626HXUWVeFeysEl4i/JNgdL5TAmb8KmaSly2T0q2KG7vXn+Dax2yUwGv2Y9X30Nw+8BZAAXd8N2goETWtXeZtgLZ5lxHCS6kkgksQIDAQAB',
  hostPermissions: [],
  networkApiBaseUrls: {
    localnet: 'http://localhost:3008/',
    devnet: 'https://api-wallet-devnet.kairo.ag/',
    testnet: 'https://api-testnet.kairo.ag/',
    mainnet: 'https://api.kairo.ag/',
  },
};

export default brand;
