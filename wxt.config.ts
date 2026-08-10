import { defineConfig } from 'wxt';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBrand, resolveBrandId } from './branding/resolve';
import { loadBrandOauthEnv } from './branding/load-env';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const brandId = resolveBrandId();
const brand = resolveBrand(brandId);
const brandRoot = path.resolve(rootDir, 'branding', brandId);
const brandOauth = loadBrandOauthEnv(brandRoot);

const sharedHostPermissions = [
  'https://accounts.google.com/*',
  'https://*.kairo.ag/*',
  'http://localhost/*',
];

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: 'build',
  // Brand-prefixed artifacts + WXT mode suffix, e.g. build/ginkgo-chrome-mv3,
  // build/nocturnal-chrome-mv3-mainnet (--mode mainnet), …-dev (dev).
  outDirTemplate: `${brand.id}-{{browser}}-mv{{manifestVersion}}{{modeSuffix}}`,
  // Brand-owned toolbar icons / fonts / backgrounds (no shared public/icon leakage).
  publicDir: path.join('branding', brandId, 'public'),
  manifest: {
    name: brand.displayName,
    description: brand.description,
    version: brand.version,
    // Stable key pins the extension ID so the OAuth redirect URI stays consistent.
    // The redirect URI will be: https://<extension-id>.chromiumapp.org/
    // Register this URI in Google Cloud Console → OAuth 2.0 Client → Authorized redirect URIs.
    key: brand.manifestKey,
    permissions: ['storage', 'identity', 'alarms'],
    host_permissions: [...sharedHostPermissions, ...brand.hostPermissions],
    // Make the extension icon fetchable by dApp pages so multi-wallet pickers
    // can render the brand icon from the canton:announceProvider event's
    // `detail.icon` URL. Without this, Chrome rewrites the URL to
    // chrome-extension://invalid/ and the picker shows a broken image.
    web_accessible_resources: [
      { resources: ['icon/*.png'], matches: ['<all_urls>'] },
    ],
  },
  imports: false,
  vite: () => ({
    define: {
      // Expose brand id for any runtime checks; primary selection is the @brand alias.
      'import.meta.env.VITE_BRAND': JSON.stringify(brandId),
      // Brand-pack OAuth always wins over root `.env` (empty if unset — no cross-brand leak).
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(
        brandOauth.VITE_GOOGLE_CLIENT_ID,
      ),
      'import.meta.env.VITE_GOOGLE_CLIENT_SECRET': JSON.stringify(
        brandOauth.VITE_GOOGLE_CLIENT_SECRET,
      ),
    },
    resolve: {
      alias: {
        '@': rootDir,
        '@lib': path.resolve(rootDir, 'lib'),
        '@components': path.resolve(rootDir, 'components'),
        '@assets': path.resolve(rootDir, 'assets'),
        '@brand': brandRoot,
      },
    },
  }),
});
