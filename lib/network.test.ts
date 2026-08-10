import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveBrand } from '../branding/resolve';

// These gates are evaluated at module-eval time from `import.meta.env`,
// so each case stubs the env and re-imports a fresh module instance.
describe('network build gating', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('default build exposes all networks and defaults to devnet', async () => {
    vi.resetModules();
    const net = await import('./network');
    expect(net.IS_MAINNET_ONLY_BUILD).toBe(false);
    expect(net.DEFAULT_NETWORK).toBe('devnet');
    expect(net.NETWORK_IDS).toEqual(['localnet', 'devnet', 'testnet', 'mainnet']);
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
});
