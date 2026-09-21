# Canton Wallet Extension (multi-brand)

A universal browser extension wallet for the **Canton Network**, with pluggable brand packs (`ginkgo`, `nocturnal`, …). Supports CIP-0103 dApp connectivity, token management, transfers, offer approvals, and activity history — backed by a single **dapp-core** backend that exposes both a **REST API** (wallet operations) and a **CIP-0103 JSON-RPC facade** (dApp transactions), all authenticated with one backend Bearer token.

Built with [WXT](https://wxt.dev), React 19, TypeScript, and Tailwind CSS 4. See [`branding/README.md`](branding/README.md) for how brands work and how to add a new one.

---

## Features

- **Single-backend architecture** — one dapp-core service per network serves both the REST API (balances, transfers, offers, faucet, onboarding) and the CIP-0103 JSON-RPC facade (`prepareExecute`, `ledgerApi`). Both surfaces use the same backend Bearer token; the extension mints no JWTs and runs no signing relay.
- **CIP-0103 dApp API** — Full Canton wallet standard: `connect`, `status`, `signMessage`, `prepareExecute`, `prepareExecuteAndWait`, `ledgerApi`, plus a non-standard `signTransaction` convenience method
- **Local signing** — All transaction hashes are signed in the background service worker by extension-held keys; private keys never leave it
- **Google OAuth sign-in** via `chrome.identity.launchWebAuthFlow()` with PKCE
- **Multi-network support** — Runtime switching between Localnet, Devnet, Testnet, and Mainnet, each with its own backend and explorer URL
- **Per-user, per-network storage isolation** — Each user's keystore and onboarding state is scoped by `{network}:{userId}`, so switching networks or accounts never leaks data
- **Token balances** — Amulet/CC, CBTC, USDCx with locked/unlocked breakdown
- **Transfers** — Dual-path: Amulet (transfer-preapproval) and CBTC/USDCx (token-standard), with per-token balance display and MAX button
- **Offers** — Incoming (approve/reject), Outgoing (withdraw), and History tabs — all via the `/transfer-offer/*` prepare/sign/submit flow, with per-network block-explorer links
- **Smart onboarding** — Detects returning users (existing public key on backend) and routes to key import instead of generation. New users allocate a Canton party via the backend's `external-party/onboarding` prepare/submit flow with local signing
- **Auto-register pre-approval** — When the backend advertises `shouldAutoRegisterPreapproval` on `/auth/me` (a server-side rollout switch), the extension silently registers the user's Amulet transfer pre-approval on dashboard mount using a narrowly-scoped in-memory key retained only for this unattended flow (no password prompt), cleared once the pre-approval is confirmed. Default-off, idempotent (skipped if one already exists), and best-effort (never blocks onboarding or the dashboard)
- **Auto-lock** — Inactivity timer (default 15 min) using `chrome.alarms`; re-lock fires only on timeout or explicit lock/logout/network-switch
- **Password-on-demand signing** — The private key is decrypted for a single signing operation and immediately discarded; it is never cached for general reuse. dApp signing collects the password in the approval popup (verify-on-approve)
- **Dual encryption** — Web Crypto API (PBKDF2 + AES-256-GCM) or CryptoJS AES, selectable at build time
- **Key export** — Base64 or Hex format toggle on options page
- **MetaMask-style approval popups** — Sensitive dApp requests require explicit user approval
- **Cross-browser** — Chrome (Manifest V3) and Firefox (Manifest V2, via WXT)

---

## Quick Start

### Prerequisites

- Node.js >= 18 (20+ recommended)
- Yarn 1.x

### Install

```bash
yarn install --ignore-engines
```

> The `--ignore-engines` flag is needed because `listr2` (a transitive dependency) declares `node >= 22`, but the extension works fine on Node 18+.

### Configure Environment

```bash
cp .env.example .env
cp branding/ginkgo/.env.example branding/ginkgo/.env
# optional second brand:
cp branding/nocturnal/.env.example branding/nocturnal/.env
```

Fill Google OAuth into **each brand's** `.env` (not the root `.env`). Root `.env` holds shared non-secret build defaults (encryption, auto-lock). See [branding/README.md](branding/README.md).

### Google OAuth Setup

The extension uses `chrome.identity.launchWebAuthFlow()` to sign in with Google. This requires registering the extension's redirect URI in Google Cloud Console:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) > APIs & Services > Credentials
2. Edit the OAuth 2.0 Client ID used by the web app
3. Under **Authorized redirect URIs**, add:

   ```text
   https://nedmfnmjfdneopknpheohpcngdaeipec.chromiumapp.org/
   ```

   > This URI is derived from the `key` field in the manifest. If you change the key, the extension ID and redirect URI will change. Run the extension and check the service worker console for the logged redirect URI.

4. Save the changes

### Development

```bash
yarn dev              # Ginkgo Chrome with hot reload
yarn dev:nocturnal    # Nocturnal Chrome with hot reload
yarn dev:firefox      # Firefox with hot reload (Ginkgo)
```

WXT opens a browser with the extension loaded. The popup is at 400 x 600px.

### Build

```bash
yarn build                    # Ginkgo → build/ginkgo-chrome-mv3
yarn build:nocturnal          # Nocturnal → build/nocturnal-chrome-mv3
yarn build:prod               # Ginkgo Mainnet-only → …-mainnet
yarn build:prod:nocturnal     # Nocturnal Mainnet-only
yarn build:all-brands         # All four Chrome variants
yarn build:firefox            # Ginkgo Firefox
yarn build:all                # Ginkgo Chrome + Firefox
```

Brand selection is via `VITE_BRAND` (independent of WXT `--mode mainnet`). Details: [`branding/README.md`](branding/README.md).
### Test

```bash
yarn test           # Run all tests once (vitest)
yarn test:watch     # Watch mode
yarn test:cov       # With coverage
yarn typecheck      # tsc --noEmit
yarn lint           # eslint .
```

### Package for Distribution

```bash
yarn zip            # Chrome .zip
yarn zip:firefox    # Firefox .zip
```

### Load Manually

- **Chrome**: `chrome://extensions` > Enable Developer mode > Load unpacked > select build output
- **Firefox**: `about:debugging` > This Firefox > Load Temporary Add-on > select manifest.json from build output

---

## Architecture

### System Overview

Ginkgo talks to a **single dapp-core backend per network**, which exposes two surfaces over the same base URL and the same Bearer token:

- **REST API** — Authentication, token balances, offer management, transfers (prepare/sign/submit), faucet, party onboarding, and activity history. The popup UI drives all wallet operations through these endpoints, with local signing in the background service worker.
- **CIP-0103 JSON-RPC facade** (`/api/v0/dapp` and `/api/v0/user`) — CIP-0103 dApp API operations (`prepareExecute`, `prepareExecuteAndWait`, `ledgerApi`). External dApps reach the Canton Ledger through this facade, mediated by the extension.

```text
                          +-----------------------+
                          |   Canton Ledger API   |
                          +----------+------------+
                                     |
                          +----------+------------+
                          |       dapp-core       |
                          |   (single backend)    |
                          |                       |
                          |  REST       Facade    |
                          |  /auth/*    /api/v0/  |
                          |  /wallet/*   dapp     |
                          |  /transfer-  user     |
                          |   offer/*             |
                          |  /external-party/*    |
                          +-----------+-----------+
                                      | Bearer token (one token for both surfaces)
     +--------------------------------+----------------------+
     |                  GINKGO EXTENSION                      |
     |                                                        |
     |  +-------------+    chrome.runtime     +------------+  |
     |  | Popup (UI)  | <----- messages ----> | Background |  |
     |  +-------------+                       | Service    |  |
     |                                        | Worker     |  |
     |  +--------------+   window.postMessage |  +------+  |  |
     |  |Content Script| <--- CIP-0103 -----> |  |Local |  |  |
     |  +------+-------+                       |  |Sign  |  |  |
     +---------|------------------------------+--+------+--+  |
               |                                              |
               v                                              |
     +---------+----------+                                   |
     | External dApp      | <---------------------------------+
     | (canton-exchange)  |
     +--------------------+
```

### Interaction Flow

#### REST API

The extension uses dapp-core's REST endpoints for **all popup-driven wallet operations**. Requests carry the backend auth token (JWT from Google OAuth) via Axios interceptors (`api-client.ts`).

| Area | Endpoints | Description |
| --- | --- | --- |
| **Authentication** | `POST /auth/login-with-google` | Exchange Google ID token for session |
| | `POST /auth/refresh-token` | Refresh expired JWT |
| | `GET /auth/me` | Fetch user profile + party info |
| **Onboarding** | `POST /external-party/onboarding/prepare` | Backend prepares a party-allocation topology tx (`{partyId, multiHash, topologyTransactions}`) |
| | `POST /external-party/onboarding/submit` | Submit locally-signed topology; backend flips party status to `SUCCESSFULLY` and persists the user↔party link |
| **Token Balances** | `GET /wallet/token-balance` | Amulet, CBTC, USDCx balances with locked/unlocked breakdown |
| **Transfer Pre-Approval** | `POST /wallet/transfer-preapproval/prepare` | Prepare a pre-approval registration (required to receive Amulet) |
| | `POST /wallet/transfer-preapproval/submit` | Submit signed pre-approval |
| | `GET /wallet/transfer-preapproval/status` | Whether a pre-approval already exists |
| **Transfers & Offers** | `POST /transfer-offer/prepare` | Prepare a transfer — Amulet (payload `assetId: 'Amulet'`) or Token Standard (CBTC/USDCx) |
| | `POST /transfer-offer/submit` | Submit signed transfer |
| | `GET /transfer-offer/incoming-requests` | List incoming offers |
| | `GET /transfer-offer/outgoing-requests` | List outgoing offers |
| | `GET /transfer-offer/history` | Offer history |
| | `POST /transfer-offer/approve/{prepare,submit}` | Approve an incoming offer |
| | `POST /transfer-offer/reject/{prepare,submit}` | Reject an incoming offer |
| | `POST /transfer-offer/withdraw/{prepare,submit}` | Withdraw an outgoing offer |
| **Faucet** | `POST /external-party/devnet-tap/{prepare,submit}` | DevNet faucet tap |

**Signing pattern for REST operations:**

```text
1. Popup requests prepare via background -> backend returns preparedTransaction + hash
2. Popup sends the user's password to background
3. Background decrypts the private key for this one signing op (then drops it)
4. Background signs preparedTransactionHash locally
5. Background submits {preparedTransaction, signature} to backend -> Canton Ledger
```

#### CIP-0103 JSON-RPC Facade

The extension uses the facade for **CIP-0103 dApp API operations**. The facade client (`gateway-facade-client.ts`) POSTs JSON-RPC 2.0 envelopes and authenticates with the **same backend Bearer token** as the REST client — there is no separate session handshake and no self-signed JWT.

| Surface | Path | Methods |
| --- | --- | --- |
| **dApp API** | `/api/v0/dapp` | `prepareExecute`, `ledgerApi` |
| **User API** | `/api/v0/user` | `getTransaction`, `execute`, `deleteTransaction` |

**Facade client** (`gateway-facade-client.ts`):

- Plain `fetch`-based JSON-RPC 2.0; base URL set per network via `setGatewayFacadeBaseUrl()` (same `apiBaseUrl` as the REST client)
- Auth: `Authorization: Bearer <sessionStore.authToken>`. On `401`, it calls `refreshAuthTokenOnce()` and retries once; a still-failing request throws `FacadeAuthRequiredError`
- Two RPC helpers: `gatewayFacadeDappRpc()` (dApp API) and `gatewayFacadeUserRpc()` (User API)
- Typed JSON-RPC error classes mapped from response codes: `FacadeNotOnboardedError` (-32001), `FacadeNotAuthorizedError` (-32002), `FacadeTemplateNotAllowedError` (-32003), `FacadeResourceNotAllowedError` (-32004), `FacadeMethodNotFoundError` (-32601), plus `FacadeNetworkError` for unreachable backends

### CIP-0103 dApp API

The extension implements the Canton CIP-0103 standard for dApp-wallet communication via `window.postMessage`:

| Method | Status | Description |
| --- | --- | --- |
| `connect` | Implemented | Check wallet readiness (unlocked + onboarded) |
| `disconnect` | Implemented | No-op by design (extension has no per-dApp server session to invalidate) |
| `isConnected` | Implemented | Alias for `connect` |
| `status` | Implemented | Provider info, connection, network, session |
| `getActiveNetwork` | Implemented | Current network config (CAIP-2 networkId + ledgerApi URL) |
| `listAccounts` | Implemented | List wallet accounts |
| `getPrimaryAccount` | Implemented | Primary account details |
| `signMessage` | Implemented | Sign arbitrary message (Ed25519 over UTF-8 bytes) |
| `prepareExecute` | Implemented | Full tx lifecycle via facade (result is `Null` per spec) |
| `prepareExecuteAndWait` | Implemented | Same, returns the execution result |
| `ledgerApi` | Implemented | Proxy to the backend Ledger API |
| `signTransaction` | Implemented | **Ginkgo extension, NOT in CIP-0103** — signs a raw base64 hash; prefer `prepareExecute` for new dApps |

### prepareExecute Flow

```text
1. dApp calls prepareExecute(commands) via CIP-0103
2. Extension forwards to facade dApp API -> returns { userUrl }
3. Extension parses transactionId + commandId from userUrl
   (transactionId is the lookup key for all user-API calls; commandId is echoed in events)
4. Extension shows approval popup to user
5. IF rejected: facade User API deleteTransaction(transactionId) -> return USER_REJECTED
6. IF approved:
     facade User API getTransaction(transactionId) -> { preparedTransactionHash }
     Sign hash locally with the key decrypted from the approval-supplied password
     facade User API execute(transactionId, signature, signedBy, partyId)
7. Extension returns result to dApp (Null for prepareExecute; { tx } for prepareExecuteAndWait)
```

### Security Model

```text
+--------------------------------------+
|           POPUP (React UI)           |  Renders UI, collects user input.
|  Never has access to private keys.   |  Sends password + tx hash to sign.
|  Receives only signatures back.      |  All API data fetched via messages.
+---------------+----------------------+
                | chrome.runtime.sendMessage
                v
+--------------------------------------+
|     BACKGROUND SERVICE WORKER        |  Holds encrypted key in chrome.storage.local.
|  Decrypts key per signing op only.   |  Signs transaction hashes, then drops the key.
|  Makes all API calls (REST+facade).  |  Manages the auth token.
|  Auto-locks after inactivity.        |  No general key cache; scoped key only for auto-register.
|  Handles CIP-0103 dApp API requests. |
+--------------------------------------+
```

**Private keys NEVER appear in popup context.** The popup sends `{ password, hashToSign }` to the service worker; the service worker decrypts, signs, and returns only the signature.

### Dual Encryption Backends

Controlled by `VITE_ENCRYPTION_BACKEND`:

| | **webcrypto** (default) | **cryptojs** |
| --- | --- | --- |
| Key derivation | PBKDF2, 100k iterations, SHA-256 | bcrypt |
| Encryption | AES-256-GCM, 12-byte IV | CryptoJS AES |
| Authentication | GCM auth tag (built-in) | -- |
| Salt | Random 16 bytes | bcrypt salt |
| Compatibility | Extension-native | Web app compatible |

### Storage

| Store | API | Persistence | Contents |
| --- | --- | --- | --- |
| `chrome.storage.local` (namespaced) | `localStore` | Survives restart | Encrypted keystore, user profile, settings, onboarding flag -- prefixed with `{network}:{userId}:` or `{network}:` |
| `chrome.storage.local` (global) | `networkStore` | Survives restart | Selected network ID (`selectedNetwork` key, not namespaced) |
| `chrome.storage.session` | `sessionStore` | Memory-only | Auth tokens, party ID, lock state, last activity timestamp |

---

## Network Configuration

The wallet supports four networks, selectable at runtime via a dropdown in the dashboard header. Shared metadata (labels, explorers, faucet flags) lives in `lib/network.ts`. Per-network **`apiBaseUrl` values come from the active brand pack** (`branding/<id>/brand.ts` → `networkApiBaseUrls`), then merge into `NETWORKS`.

| Network | Label | apiBaseUrl (Ginkgo) | apiBaseUrl (Nocturnal) | Explorer | Faucet |
| --- | --- | --- | --- | --- | --- |
| Localnet | Local Devnet | `http://localhost:3003/` | same | lighthouse.devnet.cantonloop.com | Yes |
| Devnet (default) | Devnet | `https://api-wallet-devnet.kairo.ag/` | same | lighthouse.devnet.cantonloop.com | Yes |
| Testnet | Testnet | `https://api-testnet.kairo.ag/` | same | lighthouse.testnet.cantonloop.com | No |
| Mainnet | Mainnet | `https://api.kairo.ag/` | `https://api-mpch-wallet-provider.thanhle.space/` | lighthouse.cantonloop.com | No |

Internal code keeps the bare network ID (`'devnet'`, ...) because it's embedded in storage keys, React Query cache keys, and popup state. It is converted to a CAIP-2 chain ID (`canton:devnet`) only at the CIP-0103 dApp API boundary, via `toCaip2NetworkId()`.

Network selection is persisted in a global (non-namespaced) `chrome.storage.local` key. Switching networks clears the session (auth tokens, party ID), updates the REST and facade base URLs, clears the pre-approval cache, and returns the user to the Welcome/Unlock screen. The previous network's data is preserved in isolated storage.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_ENCRYPTION_BACKEND` | `webcrypto` | `webcrypto` or `cryptojs` |
| `VITE_SALT_ROUNDS` | `10` | bcrypt salt rounds (cryptojs backend only) |
| `VITE_AUTO_LOCK_MINUTES` | `15` | Auto-lock timeout in minutes |

Per-brand (gitignored `branding/<id>/.env`):

| Variable | Description |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID for that brand's extension ID / redirect URI |
| `VITE_GOOGLE_CLIENT_SECRET` | Google OAuth client secret (Web application client) |

> **Note:** Backend URLs come from the selected network **and** the active brand pack (`networkApiBaseUrls`). Party hint comes from `branding/<id>/brand.ts`. Brand selection is via `VITE_BRAND` in yarn scripts (see [branding/README.md](branding/README.md)).

---

## Project Structure

```text
ginkgo/
|-- wxt.config.ts                 # WXT config: brand resolve, manifest, Vite aliases
|-- tsconfig.json                 # TypeScript config with path aliases
|-- vitest.config.ts              # Vitest config (node env) + path aliases
|-- postcss.config.js             # Tailwind CSS 4 PostCSS plugin
|-- package.json
|-- .env.example
|
|-- branding/                     # Brand packs (see branding/README.md)
|   |-- ginkgo/                   # theme, icons, brand.ts, public/
|   |-- nocturnal/
|   '-- README.md
|
|-- assets/icons/                 # Shared SVG icon components (Canton, CBTC, USDCx, etc.)
|                                 # icon-logo.tsx re-exports @brand/icon-logo
|
|-- entrypoints/
|   |-- background.ts                  # Service worker: message router, network init, migrations
|   |-- content.ts                     # CIP-0103 content script bridge (postMessage <-> chrome.runtime)
|   |-- provider.content.ts            # MAIN world: replies to SPLICE_WALLET_EXT_READY with EXT_ACK (detection handshake); does NOT set window.canton
|   |-- background/
|   |   |-- api-client.ts              # Axios instance for dapp-core REST (setApiBaseUrl)
|   |   |-- gateway-facade-client.ts   # fetch-based CIP-0103 JSON-RPC facade client (Bearer auth)
|   |   |-- handlers/
|   |   |   |-- dapp-api.handler.ts    # CIP-0103 method dispatch (+ signTransaction extension)
|   |   |   |-- auth.handler.ts        # Google OAuth, token refresh, logout
|   |   |   |-- signing.handler.ts     # Key decrypt + transaction signing
|   |   |   |-- keystore.handler.ts    # Key gen, import, encrypt, store, onboarding, pre-approval
|   |   |   |-- network.handler.ts     # Get/switch network, update REST + facade clients
|   |   |   |-- api.handler.ts         # Proxied REST calls (balances, offers, etc.)
|   |   |   |-- session.handler.ts     # Lock/unlock, inactivity auto-lock, scoped auto-register key
|   |   |   |-- approval.handler.ts    # MetaMask-style approval popups
|   |   |   '-- event-broadcaster.ts   # Push statusChanged/accountsChanged to dApps
|   |   '-- encryption/
|   |       |-- types.ts               # EncryptionProvider interface
|   |       |-- webcrypto.ts           # PBKDF2 + AES-256-GCM
|   |       |-- cryptojs.ts            # CryptoJS AES (web app compatible)
|   |       '-- index.ts               # Facade: selects backend via env var
|   |
|   |-- popup/                    # Main wallet UI (400 x 600px)
|   |   |-- main.tsx              # React root with QueryClient + ErrorBoundary
|   |   |-- App.tsx               # State-machine navigation (smart onboarding routing)
|   |   |-- hooks/                # Typed hooks bridging popup <-> background
|   |   '-- pages/
|   |       |-- onboarding/       # Welcome, CreatePassword, KeySetup, ShowPrivateKey, etc.
|   |       |-- Unlock.tsx        # Password entry for returning users
|   |       |-- approval/
|   |       |   '-- DappApproval.tsx  # CIP-0103 approval popup
|   |       '-- dashboard/
|   |           |-- index.tsx     # Tab container + network dropdown + account info
|   |           |-- Balances.tsx  # Token balances + pre-approval banner
|   |           |-- Transfer.tsx  # 3-step: form -> confirm -> success
|   |           |-- Settings.tsx  # PartyId, export key, lock, logout
|   |           '-- offers/       # Incoming/Outgoing/History tabs
|   |
|   '-- options/                  # Full-tab settings page
|       |-- main.tsx
|       '-- App.tsx               # Key export (Base64/Hex), encryption info
|
|-- lib/                          # Shared code (popup + background)
|   |-- network.ts                # NetworkId type, NetworkConfig, NETWORKS, toCaip2NetworkId
|   |-- auth-refresh.ts           # refreshAuthTokenOnce() shared by REST + facade clients
|   |-- dapp-api/
|   |   |-- types.ts              # CIP-0103 SpliceMessage types, JSON-RPC helpers
|   |   '-- gateway-types.ts      # Facade request/response types (prepareExecute, transactions)
|   |-- messaging/
|   |   |-- constants.ts          # MSG action string constants
|   |   |-- types.ts              # Discriminated union request/response types
|   |   |-- protocol.ts           # sendMessage(), ok(), err() helpers
|   |   '-- index.ts
|   |-- storage/
|   |   |-- schemas.ts            # Zod validation schemas
|   |   |-- local.ts              # Namespaced chrome.storage.local wrapper + migrations
|   |   |-- session.ts            # Typed chrome.storage.session wrapper
|   |   |-- network.ts            # Global network selection store (non-namespaced)
|   |   '-- index.ts
|   |-- types/                    # Shared API types
|   |-- constants.ts              # Token defs, query keys
|   |-- format.ts                 # Currency/address/date formatting
|   '-- utils.ts                  # cn(), sleep(), onCopyText(), base64/hex conversion
|
|-- tools/
|   '-- signing-relay/            # LEGACY standalone signing relay service — no longer used
|                                 #   by the facade build; retained for reference only.
|
|-- docs/                         # Design docs, plans, and specs
|   '-- superpowers/specs/        # incl. the CIP-0103 facade migration design
|
|-- components/
|   '-- common/
|       '-- ErrorBoundary.tsx     # React error boundary
|
'-- styles/
    |-- globals.css               # Popup: Tailwind + dark theme + 400x600 sizing
    '-- options.css               # Options page: Tailwind + dark theme (no fixed size)
```

> **Legacy note:** `tools/signing-relay/` and `lib/dapp-api/gateway-types.ts` contain types/services from the earlier dual-backend design (a separate Wallet Gateway plus a Socket.io signing relay). The extension no longer mints JWTs or connects to a relay — all dApp RPC now flows through the dapp-core facade with the backend Bearer token. The relay service is kept in-tree for reference but is not part of the extension build.

---

## Message Protocol

All privileged operations go through typed messages (`lib/messaging/`). The popup never directly accesses storage or makes API calls. The router lives in `entrypoints/background.ts` (`routeMessage`). To add a feature: add a `MSG.*` constant + request/response union member in `lib/messaging/`, write a handler, and wire a `case` in `routeMessage`.

| Category | Actions | Handler |
| --- | --- | --- |
| Auth | `GOOGLE_AUTH`, `REFRESH_TOKEN`, `LOGOUT`, `GET_AUTH_STATE` | `auth.handler.ts` |
| Session | `UNLOCK`, `LOCK`, `GET_LOCK_STATE` | `session.handler.ts` |
| Keystore | `CREATE_KEYPAIR`, `VALIDATE_IMPORT_KEY`, `PREPARE_ONBOARDING`, `COMPLETE_ONBOARDING`, `EXPORT_PRIVATE_KEY`, `DELETE_KEYSTORE`, `RESET_KEYSTORE_FOR_RECOVERY` | `keystore.handler.ts` |
| Signing | `SIGN_AND_SUBMIT_TRANSFER_PREAPPROVAL`, `SIGN_AND_SUBMIT_TRANSFER_TOKEN_STANDARD`, `SIGN_AND_SUBMIT_APPROVE`, `SIGN_AND_SUBMIT_REJECT`, `SIGN_AND_SUBMIT_WITHDRAW` | `signing.handler.ts` |
| Network | `GET_NETWORK`, `SWITCH_NETWORK` | `network.handler.ts` |
| Transfer pre-approval | `REGISTER_TRANSFER_PREAPPROVAL`, `GET_PREAPPROVAL_STATUS`, `MAYBE_AUTO_REGISTER_PREAPPROVAL` | `keystore.handler.ts` |
| API proxy | `FETCH_BALANCES`, `PREPARE_TRANSFER_PREAPPROVAL`, `PREPARE_TRANSFER_TOKEN_STANDARD`, `FETCH_INCOMING_OFFERS`, `FETCH_OUTGOING_OFFERS`, `FETCH_HISTORY_OFFERS`, `PREPARE_APPROVE`, `PREPARE_REJECT`, `PREPARE_WITHDRAW`, `FETCH_ABOUT_ME`, `REQUEST_FAUCET` | `api.handler.ts` |
| dApp approval | `GET_DAPP_APPROVAL`, `DAPP_APPROVAL_RESULT` | `approval.handler.ts` |

CIP-0103 dApp requests do **not** use the `MSG` protocol — they arrive as `SpliceMessage` objects from the content script and are dispatched separately by `dapp-api.handler.ts` (registered before the `MSG` router so it intercepts dApp messages first).

---

## User Flows

### Onboarding (New User)

```text
Welcome -> Google sign-in
  |  (1) POST /auth/login-with-google -> backend
  |  (2) GET /auth/me -> get party status
  -> CreatePassword (8+ chars, upper, lower, digit, special)
  -> KeySetup (auto-generate key pair)
  -> ShowPrivateKey (reveal, copy, backup)
  -> Acknowledgment (3 checkbox confirmations)
  -> TypedConfirm:
       (3) Encrypt + store keystore; cache private key in memory
       (4) IF not already onboarded:
             POST /external-party/onboarding/prepare {publicKey, hint}
               -> { partyId, multiHash, topologyTransactions }
             Sign multiHash locally with the Ed25519 private key
             POST /external-party/onboarding/submit {signedHash, preparedParty}
               -> backend submits topology to Canton, sets status SUCCESSFULLY,
                  persists user<->party link (no separate register-party call)
             Persist partyId + status
       (5) Mark onboardingComplete; set unlocked
  -> Dashboard
```

### Returning User

```text
Welcome -> Google sign-in (backend)
  -> Unlock (enter password)
       (1) Decrypt + cache private key in memory
  -> Dashboard
```

### dApp Transaction (CIP-0103 prepareExecute)

```text
dApp calls prepareExecute(commands) via window.postMessage
  -> Content script relays to background via chrome.runtime
  -> Background:
       (1) facade dApp API: prepareExecute(commands) -> { userUrl }
       (2) Parse transactionId + commandId from userUrl
       (3) Show approval popup to user
       (4) IF rejected: facade User API deleteTransaction(transactionId) -> error
       (5) IF approved:
           facade User API getTransaction(transactionId) -> { preparedTransactionHash }
           Sign hash locally with the key decrypted from the approval-popup password
           facade User API execute(transactionId, signature, signedBy, partyId)
  -> Result returned to dApp via postMessage
```

### Transfer (Popup-Driven)

```text
Dashboard -> Send tab -> Select token + recipient + amount
  (both paths use the same endpoints; the asset is selected in the request payload)
  -> IF Amulet (pre-approval path):  POST /transfer-offer/prepare { assetId: 'Amulet', ... }
  -> IF CBTC/USDCx (Token Standard): POST /transfer-offer/prepare { assetId, ... }
  -> Enter password -> decrypt key -> sign prepared hash locally
  -> POST /transfer-offer/submit { preparedData, signature }
```

### Transfer Pre-Approval

Transfer pre-approval is required to receive Amulet transfers. It is registered via `POST /wallet/transfer-preapproval/prepare` → sign locally → `POST /wallet/transfer-preapproval/submit`, and its presence is checked via `GET /wallet/transfer-preapproval/status`. If missing, a warning banner appears on the Balances tab with a manual registration button.

**Preapproval cache TTL:** After a successful registration (or the backend confirming the preapproval exists), the status is cached in-memory for **30 minutes** (`PREAPPROVAL_CACHE_TTL_MS`). During this window, `GET_PREAPPROVAL_STATUS` returns `true` without hitting the backend. After expiry, the next status check re-queries the backend, allowing the banner to reappear if the on-chain preapproval has expired. The cache is also cleared on **logout** and **network switch**.

**Silent auto-registration (rollout-flag gated):** Registration can also happen automatically, without the user clicking the banner button. `GET /auth/me` carries a boolean `shouldAutoRegisterPreapproval` at the **top level** of its response `data` (a sibling of `party`, not nested under it) — a **server-side rollout switch** (sourced from the backend's `AUTO_REGISTER_PREAPPROVAL_ON_ONBOARD` env). Because it's config-derived and party-independent, it's present even on a brand-new user's first login when `party` is `null`. `handleGoogleAuth` persists it into `sessionStore` (default `false` when the field is absent, so older backends and disabled rollouts change nothing). On dashboard mount, `Balances.tsx` fires `MAYBE_AUTO_REGISTER_PREAPPROVAL` once. The background handler `handleMaybeAutoRegisterPreapproval` then:

1. **Default-off** — returns `disabled` immediately if the flag is `false` (no network calls).
2. **Silent only** — requires the scoped RAM-only auto-register key (`getAutoRegisterKey()`), which is populated at unlock/onboarding **only when this rollout flag is pending** (`maybeCacheAutoRegisterKey`) and cleared on lock/logout/network-switch and once the preapproval is confirmed. If it is absent (wallet locked, or flag not pending) it returns `locked` and skips — it **never** prompts for a password. Every other signing flow is password-on-demand; this scoped key exists solely because auto-register runs unattended.
3. **Idempotent** — calls `GET_PREAPPROVAL_STATUS` first; if a pre-approval already exists it returns `already-registered`, clears the scoped key, and does nothing further.
4. **Registers** — otherwise it signs the prepared hash with the scoped key (via `signHashWithKey`, the raw-key twin of the manual path's `signHashWithPassword`) through the shared prepare → sign → submit body, then clears the scoped key.

The handler is **best-effort**: it always resolves with `{ attempted, registered, reason? }` and never throws, so a failure never blocks the dashboard. The banner is suppressed while auto-registration is in flight to avoid a flash. This reuses the existing manual registration handler and is unrelated to the Amulet token-transfer `PREPARE`/`SIGN_AND_SUBMIT_TRANSFER_PREAPPROVAL` flow (which does prompt for a password).

### Offer Actions (Popup-Driven)

```text
Incoming offer -> Approve/Reject:
  (1) POST /transfer-offer/{approve,reject}/prepare
  (2) Enter password -> sign locally
  (3) POST /transfer-offer/{approve,reject}/submit

Outgoing offer -> Withdraw:
  (1) POST /transfer-offer/withdraw/prepare
  (2) Enter password -> sign locally
  (3) POST /transfer-offer/withdraw/submit
```

### Faucet (DevNet only)

```text
Token detail -> Tap Faucet:
  (1) POST /external-party/devnet-tap/prepare -> { hash, preparedTx }
  (2) Sign hash locally by decrypting with the entered password (wrong password fails)
  (3) POST /external-party/devnet-tap/submit -> Canton Ledger
```

### Network Switching

```text
Dashboard -> Header network dropdown
  -> Select different network
  -> Session cleared (auth tokens, partyId)
  -> Pre-approval cache cleared
  -> REST + facade base URLs updated
  -> App returns to Welcome/Unlock
  -> Previous network's data preserved in isolated storage
```

---

## Token Configuration

Defined in `lib/constants.ts` (`SUPPORTED_TOKENS`). All three use Daml's `Numeric 10` type, so decimals are 10 across the board.

| Token | Symbol | Decimals | Min Amount |
| --- | --- | --- | --- |
| Amulet | CC | 10 | 10 |
| Canton Bitcoin | CBTC | 10 | 0.00001 |
| Canton USD Coin | USDCx | 10 | 1 |

---

## Security Notes

- **Key isolation**: Private keys exist only in the background service worker. The popup never has access.
- **Password-on-demand signing**: The decrypted private key is never cached for general reuse — it exists only transiently in the service worker during a single sign call (via `sign-with-password.ts`) and the reference is dropped immediately. Popup and REST flows send the password per signing op; dApp signing collects it in the approval popup (verify-on-approve). The sole exception is a narrowly-scoped in-memory key used only for silent auto-register of transfer pre-approval, cleared on lock/logout/network-switch/auto-lock and once the pre-approval is confirmed.
- **Single auth token**: Both the REST API and the CIP-0103 facade authenticate with the same backend Bearer token (Google OAuth JWT in `chrome.storage.session`). The extension mints no JWTs of its own. On a `401`, the facade refreshes the token once and retries.
- **Key fingerprint verification**: Before signing, the handler verifies that the private key's Canton fingerprint (`0x1220 || SHA256(int32_be(12) || pubkey)`) matches the partyId's namespace to prevent signing with a mismatched key.
- **Auto-clear**: Exported private keys are automatically cleared from UI state after 30 seconds.
- **Auto-lock**: Wallet locks after a configurable **inactivity** timeout (default 15 min) — the only re-lock triggers are the timeout and explicit lock/logout/network-switch. Session data and the scoped auto-register key are wiped.
- **No localStorage**: Auth tokens use `chrome.storage.session` (memory-only, cleared on browser close).
- **Per-user isolation**: Keystores are scoped by `{network}:{userId}:keystore`, preventing data leaks between accounts or networks.
- **dApp approval**: Sensitive CIP-0103 methods require explicit user approval via a popup window. Rejected `prepareExecute` transactions are cleaned up via the facade's `deleteTransaction` to avoid orphaned pending state.
- **No XSS vectors**: No use of `dangerouslySetInnerHTML`, `eval`, or dynamic script injection.

---

## Manifest Permissions

```jsonc
{
  "permissions": ["storage", "identity", "alarms"],
  "host_permissions": [
    "https://accounts.google.com/*",
    "https://*.kairo.ag/*",
    "http://localhost/*"
  ],
  "web_accessible_resources": [
    { "resources": ["icon/*.png"], "matches": ["<all_urls>"] }
  ]
}
```

| Permission | Reason |
| --- | --- |
| `storage` | Encrypted keystore (`chrome.storage.local`) and session tokens (`chrome.storage.session`) |
| `identity` | Google OAuth via `chrome.identity.launchWebAuthFlow()` |
| `alarms` | Auto-lock timer |
| `host_permissions` | Google OAuth, dapp-core backends (`*.kairo.ag`, plus per-brand extras e.g. `*.thanhle.space`), and localdev (`localhost`) |
| `web_accessible_resources` | Lets dApp multi-wallet pickers fetch the brand icon from the `announceProvider` event |

The manifest is built in `wxt.config.ts` from the active brand pack (name, version, `key`, host_permissions). Each brand's `manifestKey` pins a distinct extension ID / OAuth redirect — **do not change a pack's key** without re-registering the redirect URI.

---

## Path Aliases

Configured in `wxt.config.ts` (Vite) and `vitest.config.ts`:

| Alias | Path |
| --- | --- |
| `@/` | Project root |
| `@lib/` | `lib/` |
| `@components/` | `components/` |
| `@assets/` | `assets/` |
| `@brand/` | `branding/<VITE_BRAND>/` (build-time; typecheck defaults to `ginkgo`) |

---

## Tech Stack

| Layer | Choice |
| --- | --- |
| Framework | WXT 0.20 (Vite-based, MV3) |
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS 4 + Radix UI |
| Server State | TanStack React Query |
| Forms | React Hook Form + Zod |
| HTTP | Axios (REST) + `fetch` (JSON-RPC facade) |
| Crypto | `@canton-network/core-signing-lib` |
| Encryption | Web Crypto API / CryptoJS |
| Icons | lucide-react |
| Math | BigNumber.js |
| Testing | Vitest |

---

## Scripts

| Command | Description |
| --- | --- |
| `yarn dev` | Ginkgo Chrome hot reload |
| `yarn dev:nocturnal` | Nocturnal Chrome hot reload |
| `yarn dev:firefox` | Ginkgo Firefox hot reload |
| `yarn build` | Ginkgo Chrome → `build/ginkgo-chrome-mv3` |
| `yarn build:nocturnal` | Nocturnal Chrome → `build/nocturnal-chrome-mv3` |
| `yarn build:prod` | Ginkgo Mainnet-only |
| `yarn build:prod:nocturnal` | Nocturnal Mainnet-only |
| `yarn build:all-brands` | All four Chrome brand × mainnet variants |
| `yarn build:firefox` | Ginkgo Firefox production build |
| `yarn build:all` | Ginkgo Chrome + Firefox |
| `yarn zip` | Package Chrome extension as .zip |
| `yarn zip:firefox` | Package Firefox extension as .zip |
| `yarn test` | Run all tests once (Vitest) |
| `yarn test:watch` | Run tests in watch mode |
| `yarn test:cov` | Run tests with coverage |
| `yarn typecheck` | Run TypeScript type checking |
| `yarn lint` | Run ESLint |
| `yarn format` | Run Prettier |
