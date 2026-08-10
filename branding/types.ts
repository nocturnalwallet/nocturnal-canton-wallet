/**
 * Shared contract for brand packs under `branding/<id>/`.
 * Core code imports the active pack via the `@brand` Vite alias.
 */

export type BrandId = 'ginkgo' | 'nocturnal';

export type BrandNetworkId = 'localnet' | 'devnet' | 'testnet' | 'mainnet';

export interface BrandConfig {
  id: BrandId;
  displayName: string;
  packageName: string;
  description: string;
  /** CIP-0103 provider.id + signingProviderId */
  providerId: string;
  /** announceProvider detail.name */
  providerName: string;
  partyHintDefault: string;
  logTag: string;
  /** Manifest version + CIP-0103 provider.version */
  version: string;
  /** Chrome extension public key (pins extension ID / OAuth redirect) */
  manifestKey: string;
  /** Extra host_permissions beyond shared Google / *.kairo.ag / localhost */
  hostPermissions: string[];
  /** Per-network apiBaseUrl overrides merged into lib/network.ts */
  networkApiBaseUrls: Partial<Record<BrandNetworkId, string>>;
  /** Optional Welcome backdrop under the brand publicDir, e.g. '/bg/skyline.jpg' */
  welcomeBackgroundUrl?: string;
}
