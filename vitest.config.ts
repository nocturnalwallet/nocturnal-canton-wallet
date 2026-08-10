import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { resolveBrandId } from './branding/resolve';

const brandId = resolveBrandId(process.env.VITE_BRAND ?? 'ginkgo');
const brandRoot = path.resolve(__dirname, 'branding', brandId);

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      include: [
        'entrypoints/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
      ],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      '@lib': path.resolve(__dirname, 'lib'),
      '@components': path.resolve(__dirname, 'components'),
      '@assets': path.resolve(__dirname, 'assets'),
      '@brand': brandRoot,
    },
  },
});
