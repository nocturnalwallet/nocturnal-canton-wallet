# Nocturnal — Google OAuth setup

Nocturnal is a distinct extension (its own extension ID), so it needs its own
Google Cloud **project** and OAuth **client**, and that client must list
Nocturnal's redirect URI. Until this is done, Google sign-in fails with
`redirect_uri_mismatch`; all non-OAuth flows work normally.

- Extension ID: `iijglelilemfjgadbekgleiclimbaopf`
- Redirect URI to register: `https://iijglelilemfjgadbekgleiclimbaopf.chromiumapp.org/`
  (include the trailing slash — it must match `chrome.identity.getRedirectURL()` exactly)

## How the extension uses OAuth

`entrypoints/background/handlers/auth.handler.ts` runs an authorization-code +
PKCE flow via `chrome.identity.launchWebAuthFlow()`:

- Auth endpoint: `https://accounts.google.com/o/oauth2/v2/auth`
- Scopes: `openid email profile`
- Token exchange: `https://oauth2.googleapis.com/token` — sends `client_secret`,
  so the OAuth client must be of type **Web application**.
- The resulting Google **ID token** is forwarded to the backend `/auth/login`.

The client ID and secret are read from **`branding/nocturnal/.env`**
(`VITE_GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_SECRET`). Copy
`.env.example` → `.env` in this folder and fill them in. Do **not** put
Nocturnal OAuth in the repo-root `.env` — that file is shared across brands
and would contaminate Ginkgo builds.

## Step 1 — Create a new Google Cloud project for Nocturnal

1. Open the Google Cloud Console: https://console.cloud.google.com
2. Click the project picker in the top bar → **New Project**.
3. Name it e.g. `Nocturnal Wallet` (pick an org/location if prompted) → **Create**.
4. Once created, make sure the project picker has **Nocturnal Wallet** selected —
   every step below must happen inside this project.

## Step 2 — Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen** (in the Nocturnal project).
2. User type: **External** → **Create**.
3. App information:
   - App name: `Nocturnal`
   - User support email: your email
   - Developer contact email: your email
   - (Logo/domain are optional for testing.)
4. **Scopes:** add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
   (these correspond to the `openid email profile` scopes the extension requests).
   Save and continue.
5. **Test users:** while the app is in **Testing**, add every Google account that
   will sign in (they must be listed here or Google blocks them). Save and continue.
6. Leave the app in **Testing** for development. (Publishing to Production requires
   Google's verification for sensitive scopes; not needed for dev/hackathon use.)

## Step 3 — Create the OAuth client ID

1. **APIs & Services → Credentials → + Create credentials → OAuth client ID**.
2. Application type: **Web application**.
   (Not "Chrome extension" — this flow uses `launchWebAuthFlow` with a
   `chromiumapp.org` redirect and a client secret, which is the Web-application
   pattern.)
3. Name: e.g. `Nocturnal extension`.
4. Under **Authorized redirect URIs**, click **+ Add URI** and paste:
   `https://iijglelilemfjgadbekgleiclimbaopf.chromiumapp.org/`
   (exact, with the trailing slash).
5. Click **Create**. Copy the **Client ID** and **Client secret** shown.

## Step 4 — Wire the credentials into the extension

1. In **`branding/nocturnal/.env`** (create it from `.env.example` in the same folder), set:
   ```
   VITE_GOOGLE_CLIENT_ID=<the Client ID from Step 3>
   VITE_GOOGLE_CLIENT_SECRET=<the Client secret from Step 3>
   ```
   That file is gitignored — do not commit real secrets. Do not put these in the repo-root `.env`.
2. Rebuild: `yarn build:nocturnal` (or restart `yarn dev:nocturnal`). Env vars are
   inlined at build time, so a change to the brand `.env` requires a rebuild.

## Step 5 — Verify

1. Load `build/nocturnal-chrome-mv3` unpacked at `chrome://extensions` (Developer mode on).
   Confirm the extension ID shown is `iijglelilemfjgadbekgleiclimbaopf` — if it is
   different, the redirect URI won't match and sign-in will fail. (The ID is pinned
   by the manifest `key`; do not change `key`.)
2. Open onboarding and sign in with a Google account that is listed as a **Test user**
   (Step 2.5).
3. Success = the flow returns and the wallet proceeds past sign-in. If you see
   `redirect_uri_mismatch`, re-check the redirect URI in Step 3.4; allow a few
   minutes for Google to propagate credential changes.

## Notes

- Reusing the existing (Ginkgo/web-app) Google project instead of a new one also
  works — just add Nocturnal's redirect URI to that project's existing Web-application
  client and reuse its client ID/secret. A dedicated Nocturnal project (above) keeps
  the fork's OAuth config, consent screen, and test-user list independent.
- The redirect URI is derived from the extension ID, which is derived from the
  manifest `key`. If the `key` ever changes, the ID and redirect URI change too and
  must be re-registered.
