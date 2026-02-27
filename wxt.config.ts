import { defineConfig } from 'wxt';
import path from 'node:path';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: 'build',
  manifest: {
    name: 'Ginkgo',
    description: 'Ginkgo — Canton Network wallet browser extension with CIP-0103 dApp API support',
    version: '0.2.0',
    // Stable key pins the extension ID so the OAuth redirect URI stays consistent.
    // The redirect URI will be: https://<extension-id>.chromiumapp.org/
    // Register this URI in Google Cloud Console → OAuth 2.0 Client → Authorized redirect URIs.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1wm7Jt0cFnGf9ecUzFcSNx2NjY6ayMNQw8d4xgjW41L5ue7FRcODaFWngjxsdgiomU01LMgGHRD5eLbM7mi/iqKs0jYKooKRQk5TaDnZyAHtluDTzeCLBa+QXBJbx3qC88vWRSoDkmEIq6EQ0KlAk3o120IXRY6UYdn6TXXvqLo4vhWya8WfBTLorQtJJo7ByghgIFXDkSYiAvaSeiPAf2bxGU8l+HXJHIYouKECJHPoBW3CB626HXUWVeFeysEl4i/JNgdL5TAmb8KmaSly2T0q2KG7vXn+Dax2yUwGv2Y9X30Nw+8BZAAXd8N2goETWtXeZtgLZ5lxHCS6kkgksQIDAQAB',
    permissions: ['storage', 'identity', 'alarms'],
    host_permissions: [
      'https://accounts.google.com/*',
      'https://*.kairo.ag/*',
      'http://localhost/*',
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
