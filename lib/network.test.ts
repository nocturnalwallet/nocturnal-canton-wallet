import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveBrand } from '../branding/resolve';
import {
  resolveEnabledNetworkIds,
  resolveDefaultNetwork,
  type NetworkId,
} from './network';

// These gates are evaluated at module-eval time from `import.meta.env`,
// so each case stubs the env and re-imports a fresh module instance.
describe('network build gating', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('default build exposes the active brand allowlist (nocturnal: devnet + mainnet, mainnet default)', async () => {
    vi.resetModules();
    const net = await import('./network');
    expect(net.IS_MAINNET_ONLY_BUILD).toBe(false);
    expect(net.DEFAULT_NETWORK).toBe('mainnet');
    expect(net.NETWORK_IDS).toEqual(['devnet', 'mainnet']);
  });

  it('mainnet-only build (VITE_MAINNET_ONLY=true) exposes only mainnet', async () => {
    vi.stubEnv('VITE_MAINNET_ONLY', 'true');
    vi.resetModules();
    const net = await import('./network');
    expect(net.IS_MAINNET_ONLY_BUILD).toBe(true);
    expect(net.DEFAULT_NETWORK).toBe('mainnet');
    expect(net.NETWORK_IDS).toEqual(['mainnet']);
  });

  it('apiBaseUrls come from the active brand pack', async () => {
    const brand = resolveBrand();
    vi.resetModules();
    const net = await import('./network');
    expect(net.NETWORKS.mainnet.apiBaseUrl).toBe(brand.networkApiBaseUrls.mainnet);
    expect(net.NETWORKS.devnet.apiBaseUrl).toBe(brand.networkApiBaseUrls.devnet);
    expect(net.NETWORKS.testnet.apiBaseUrl).toBe(brand.networkApiBaseUrls.testnet);
    expect(net.NETWORKS.localnet.apiBaseUrl).toBe(brand.networkApiBaseUrls.localnet);
  });

  it('transactionExplorerUrl joins base and updateId', async () => {
    vi.resetModules();
    const net = await import('./network');
    expect(
      net.transactionExplorerUrl(
        'https://lighthouse.devnet.cantonloop.com/',
        '12206d0f93',
      ),
    ).toBe('https://lighthouse.devnet.cantonloop.com/transactions/12206d0f93');
  });

  it('toCaip2NetworkId emits DA-canonical CAIP-2 ids (PartyLayer-recognized)', async () => {
    vi.resetModules();
    const net = await import('./network');
    expect(net.toCaip2NetworkId('mainnet')).toBe('canton:da-mainnet');
    expect(net.toCaip2NetworkId('testnet')).toBe('canton:da-testnet');
    expect(net.toCaip2NetworkId('devnet')).toBe('canton:da-devnet');
    expect(net.toCaip2NetworkId('localnet')).toBe('canton:da-local');
  });
});

// Pure derivation helpers for the exposed network set and landing network.
// They take the brand's optional `enabledNetworks` allowlist plus the
// mainnet-only build flag and are unit-tested here without brand stubbing.
describe('resolveEnabledNetworkIds', () => {
  const ALL: NetworkId[] = ['localnet', 'devnet', 'testnet', 'mainnet'];

  it('returns all networks when the brand sets no allowlist', () => {
    expect(resolveEnabledNetworkIds(undefined, ALL, false)).toEqual(ALL);
  });

  it('returns the brand allowlist (subset) when set', () => {
    expect(resolveEnabledNetworkIds(['devnet', 'mainnet'], ALL, false)).toEqual([
      'devnet',
      'mainnet',
    ]);
  });

  it('narrows to mainnet-only regardless of the allowlist', () => {
    expect(resolveEnabledNetworkIds(['devnet', 'mainnet'], ALL, true)).toEqual([
      'mainnet',
    ]);
    expect(resolveEnabledNetworkIds(undefined, ALL, true)).toEqual(['mainnet']);
  });

  it('throws on an empty allowlist', () => {
    expect(() => resolveEnabledNetworkIds([], ALL, false)).toThrow(
      /enabledNetworks/,
    );
  });

  it('throws on an unknown network id', () => {
    expect(() =>
      // @ts-expect-error deliberately invalid id
      resolveEnabledNetworkIds(['devnet', 'staging'], ALL, false),
    ).toThrow(/staging/);
  });
});

describe('resolveDefaultNetwork', () => {
  it('defaults to devnet when the brand sets no allowlist', () => {
    expect(
      resolveDefaultNetwork(undefined, ['localnet', 'devnet', 'testnet', 'mainnet'], false),
    ).toBe('devnet');
  });

  it('prefers mainnet when it is in the allowlist', () => {
    expect(
      resolveDefaultNetwork(['devnet', 'mainnet'], ['devnet', 'mainnet'], false),
    ).toBe('mainnet');
  });

  it('falls back to the first listed network when mainnet is absent', () => {
    expect(
      resolveDefaultNetwork(['localnet', 'devnet'], ['localnet', 'devnet'], false),
    ).toBe('localnet');
  });

  it('is mainnet in a mainnet-only build', () => {
    expect(resolveDefaultNetwork(['devnet', 'mainnet'], ['mainnet'], true)).toBe(
      'mainnet',
    );
  });
});

// End-to-end over the real brand packs: confirms `enabledNetworks` flows from
// the pack into the derived exposed set / landing network.
describe('brand enabledNetworks integration', () => {
  it('nocturnal preview exposes devnet + mainnet, defaulting to mainnet', () => {
    const nocturnal = resolveBrand('nocturnal');
    expect(nocturnal.enabledNetworks).toEqual(['devnet', 'mainnet']);
    const ids = resolveEnabledNetworkIds(
      nocturnal.enabledNetworks,
      ['localnet', 'devnet', 'testnet', 'mainnet'],
      false,
    );
    expect(ids).toEqual(['devnet', 'mainnet']);
    expect(resolveDefaultNetwork(nocturnal.enabledNetworks, ids, false)).toBe(
      'mainnet',
    );
  });
});
