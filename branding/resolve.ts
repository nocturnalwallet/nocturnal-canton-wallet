import type { BrandConfig, BrandId } from './types';
import nocturnal from './nocturnal/brand';

export const BRAND_IDS = ['nocturnal'] as const satisfies readonly BrandId[];

const BRANDS: Record<BrandId, BrandConfig> = {
  nocturnal,
};

/**
 * Resolve the active brand from `VITE_BRAND` (default: nocturnal — the only brand).
 * Used by wxt.config.ts and vitest; extension runtime imports via `@brand/brand`.
 */
export function resolveBrandId(raw: string | undefined = process.env.VITE_BRAND): BrandId {
  const id = (raw ?? 'nocturnal') as BrandId;
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
