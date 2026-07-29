# Nocturnal — Google OAuth redirect setup

Nocturnal uses a new extension ID, so the OAuth redirect URI must be registered
before Google sign-in works.

- Extension ID: `iijglelilemfjgadbekgleiclimbaopf`
- Redirect URI to add: `https://iijglelilemfjgadbekgleiclimbaopf.chromiumapp.org/`  (include the trailing slash)

Steps:
1. Open https://console.cloud.google.com and select the project that owns the
   OAuth client in `VITE_GOOGLE_CLIENT_ID`.
2. APIs & Services → Credentials.
3. Under "OAuth 2.0 Client IDs", open the client used by the extension.
4. In "Authorized redirect URIs", click "+ Add URI" and paste the redirect URI above.
5. Click Save. Allow a few minutes to propagate.
6. Reload the unpacked extension and test Google sign-in from onboarding.

Until this URI is registered, sign-in will fail with redirect_uri_mismatch;
all non-OAuth flows work normally.
