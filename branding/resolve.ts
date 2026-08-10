import type { BrandId } from './types';
import ginkgo from './ginkgo/brand';
import nocturnal from './nocturnal/brand';
import type { BrandConfig } from './types';

export const BRAND_IDS = ['ginkgo', 'nocturnal'] as const satisfies readonly BrandId[];

const BRANDS: Record<BrandId, BrandConfig> = {
  ginkgo,
  nocturnal,
};

/**
 * Resolve the active brand from `VITE_BRAND` (default: ginkgo).
 * Used by wxt.config.ts and vitest; extension runtime imports via `@brand/brand`.
 */
export function resolveBrandId(raw: string | undefined = process.env.VITE_BRAND): BrandId {
  const id = (raw ?? 'ginkgo') as BrandId;
  if (!(BRAND_IDS as readonly string[]).includes(id)) {
    throw new Error(
      `Unknown VITE_BRAND="${raw ?? ''}". Expected one of: ${BRAND_IDS.join(', ')}`,
    );
  }
  return id;
}

export function resolveBrand(raw?: string): BrandConfig {
  return BRANDS[resolveBrandId(raw)];
}
