import { defineConfig } from 'wxt';
import path from 'node:path';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: 'build',
  manifest: {
    name: 'Nocturnal',
    description: 'Nocturnal — Canton Network wallet browser extension with CIP-0103 dApp API support',
    version: '0.1.1',
    // Stable key pins the Nocturnal extension ID so the OAuth redirect URI stays consistent.
    // The redirect URI will be: https://<extension-id>.chromiumapp.org/
    // Register this URI in Google Cloud Console → OAuth 2.0 Client → Authorized redirect URIs.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAm+5/uaDpKxZpz4vZ+EwkLhbehAa+8OSwC28pacF6YoEveydmZo0g6GmRUIGZFf3BT1LcJlRhMu/EUsTZYWWy485HdxWI9MXJYWD4F+95wQCbze/qqvIWXSyNBAAfydB/4XllAiGttoEmefInRinjjRPrvADtAEEraUANS8M4C3xwYPMIG9OQWIn/BY/m4r5pcgzBEZ+vHXaFbcapFO36j7cLO/fXyST8pkyyUtorjAnDgkiyamo5Y3LpZcVvpA2xCZuOo9zfKLpT5UMQnYjuNhBYW+7oVBRwmvPiG1SVNRk+JQaQPsUeQplr+52s0NVl/5CQFeqgT41T+6iD2/4rwwIDAQAB',
    permissions: ['storage', 'identity', 'alarms'],
    host_permissions: [
      'https://accounts.google.com/*',
      'https://*.kairo.ag/*',
      // Mainnet gateway (see NETWORKS.mainnet in lib/network.ts). Declared so
      // the manifest matches actual egress and MV3 doesn't CORS-block it.
      'https://*.thanhle.space/*',
      'http://localhost/*',
    ],
    // Make the extension icon fetchable by dApp pages so multi-wallet pickers
    // can render Nocturnal's icon from the canton:announceProvider event's
    // `detail.icon` URL. Without this, Chrome rewrites the URL to
    // chrome-extension://invalid/ and the picker shows a broken image.
    web_accessible_resources: [
      { resources: ['icon/*.png'], matches: ['<all_urls>'] },
    ],
  },
  imports: false,
  vite: () => ({
    resolve: {
      alias: {
        '@': path.resolve(__dirname),
        '@lib': path.resolve(__dirname, 'lib'),
        '@components': path.resolve(__dirname, 'components'),
        '@assets': path.resolve(__dirname, 'assets'),
      },
    },
  }),
});
