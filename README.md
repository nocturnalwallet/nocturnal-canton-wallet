# Ginkgo Wallet

A universal browser extension wallet for the **Canton Network**. Supports CIP-0103 dApp connectivity, token management, transfers, offer approvals, and activity history — with a dual-backend architecture using **dapp-core** (REST middleware for wallet operations) and the **Wallet Gateway** (JSON-RPC for CIP-0103 dApp transactions and onboarding).

Built with [WXT](https://wxt.dev), React 19, TypeScript, and Tailwind CSS 4.

---

## Features

- **Dual-backend architecture** — dapp-core REST API for wallet operations (balances, transfers, offers, faucet); Wallet Gateway JSON-RPC for CIP-0103 dApp transactions and onboarding
- **CIP-0103 dApp API** — Full Canton wallet standard: `connect`, `status`, `signTransaction`, `prepareExecute`, `prepareExecuteAndWait`, `ledgerApi`
- **Wallet Gateway integration** — dApp transactions prepared and executed via Gateway JSON-RPC, with local signing by extension-held keys
- **Signing relay client** — Socket.io connection to a signing relay service, enabling the Wallet Gateway to request signatures from the extension for Gateway-initiated operations (e.g. `createWallet`)
- **Google OAuth sign-in** via `chrome.identity.launchWebAuthFlow()` with PKCE
- **Multi-network support** — Runtime switching between Localnet, Devnet, Testnet, and Mainnet with per-network API, Gateway, and relay URLs
- **Per-user, per-network storage isolation** — Each user's keystore and onboarding state is scoped by `{network}:{userId}`, so switching networks or accounts never leaks data
- **Token balances** — Amulet/CC, CBTC, USDCx with locked/unlocked breakdown (via dapp-core)
- **Transfers** — Dual-path: Amulet (transfer-preapproval) and CBTC/USDCx (token-standard), with per-token balance display and MAX button
- **Offers** — Incoming (approve/reject), Outgoing (withdraw), History — all via dapp-core prepare/sign/submit flow
- **Activity** — Paginated transaction history with dynamic block explorer links (per-network)
- **Smart onboarding** — Detects returning users (existing public key on backend) and routes to key import instead of generation. New users onboard via Gateway `createWallet` with relay-mediated signing
- **Auto-lock** — Configurable timer (default 15 min) using `chrome.alarms`
- **In-memory key caching** — Private key cached in background service worker during unlocked session for passwordless CIP-0103 signing and relay responses
- **Dual encryption** — Web Crypto API (PBKDF2 + AES-256-GCM) or CryptoJS AES, selectable at build time
- **Key isolation** — Private keys never leave the background service worker
- **Key export** — Base64 or Hex format toggle on options page
- **MetaMask-style approval popups** — dApp requests and relay signing requests require explicit user approval
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
```

Fill in `VITE_GOOGLE_CLIENT_ID` (same client ID as the web app).

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
yarn dev          # Chrome with hot reload
yarn dev:firefox  # Firefox with hot reload
```

WXT opens a browser with the extension loaded. The popup is at 400 x 600px.

### Build

```bash
yarn build          # Chrome production build
yarn build:firefox  # Firefox production build
yarn build:all      # Both
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

Ginkgo interacts with **two backend services**, each serving a distinct role:

- **dapp-core** (REST API) — Authentication, token balances, offer management, transfers (prepare/sign/submit), faucet, and activity history. The extension's popup UI drives all wallet operations through dapp-core, with local signing in the background service worker.
- **Wallet Gateway** (JSON-RPC 2.0) — CIP-0103 dApp API operations (`prepareExecute`, `ledgerApi`) and wallet onboarding (`createWallet`). External dApps interact with the Canton Ledger through the Gateway, mediated by the extension.

```text
                          +-----------------------+
                          |   Canton Ledger API   |
                          +----------+------------+
                                     |
                     +---------------+---------------+
                     |                               |
              +------+------+               +--------+--------+
              |   dapp-core |               | Wallet Gateway  |
              |  (REST API) |               | (JSON-RPC 2.0)  |
              +------+------+               +--------+--------+
                     |                               |
                     |   +---------------------------+
                     |   |                           |
                     |   |  dApp API    User API     |
                     |   | /api/v0/    /api/v0/      |
                     |   |  dapp        user         |
                     |   |                           |
     +---------------+---+---------------------------+-------+
     |                  GINKGO EXTENSION                     |
     |                                                       |
     |  +-------------+    chrome.runtime     +-----------+  |
     |  | Popup (UI)  | <----- messages ----> | Background|  |
     |  +-------------+                       | Service   |  |
     |                                        | Worker    |  |
     |  +-------------+    window.postMessage +-----------+  |
     |  |Content Script| <--- CIP-0103 --->  /  |    |      |
     |  +------+------+                     /   |    |      |
     +---------|-----------+---------------/----+----+------+
               |           |              /     |    |
               |           | Socket.io   /      |    |
               |           v            /       |    v
               |    +------+-------+   /   +----+--------+
               |    |Signing Relay |  /    | Local       |
               |    | (Socket.io)  | /     | Signing     |
               |    +--------------+       | (in-memory) |
               |                           +-------------+
               v
     +---------+----------+
     | External dApp      |
     | (canton-exchange)  |
     +--------------------+
```

### Interaction Flow by Backend

#### dapp-core Middleware (REST API)

The extension talks to dapp-core for **all popup-driven wallet operations**. Requests use the dapp-core auth token (JWT from Google OAuth) via Axios interceptors.

| Area | Endpoints | Description |
| --- | --- | --- |
| **Authentication** | `POST /auth/login-with-google` | Exchange Google ID token for session |
| | `POST /auth/refresh-token` | Refresh expired JWT |
| | `GET /auth/me` | Fetch user profile + party info |
| | `POST /auth/register-party` | Link partyId to user after onboarding |
| **Token Balances** | `GET /wallet/token-balance` | Amulet, CBTC, USDCx balances with locked/unlocked breakdown |
| **Transfers (Amulet)** | `POST /external-party/transfer-amulet/prepare` | Prepare Amulet transfer via pre-approval |
| | `POST /external-party/transfer-amulet/submit` | Submit signed Amulet transfer |
| **Offers (Token Standard)** | `POST /offers/prepare` | Prepare token-standard transfer (CBTC/USDCx) |
| | `POST /offers/submit` | Submit signed transfer |
| | `GET /offers/incoming-requests` | List incoming offers |
| | `GET /offers/outgoing-requests` | List outgoing offers |
| | `GET /offers/history` | Offer history |
| | `POST /offers/approve/prepare` | Prepare offer approval |
| | `POST /offers/approve/submit` | Submit signed approval |
| | `POST /offers/reject/prepare` | Prepare offer rejection |
| | `POST /offers/reject/submit` | Submit signed rejection |
| | `POST /offers/withdraw/prepare` | Prepare outgoing offer withdrawal |
| | `POST /offers/withdraw/submit` | Submit signed withdrawal |
| **Faucet** | `POST /external-party/devnet-tap/prepare` | Prepare DevNet faucet tap |
| | `POST /external-party/devnet-tap/submit` | Submit signed faucet transaction |
| **Activity** | `GET /external-party/tx-history` | Paginated transaction history |

**Signing pattern for dapp-core operations:**

```text
1. Popup requests prepare via background -> dapp-core returns preparedTransaction + hash
2. Popup sends password to background
3. Background decrypts private key (or uses cached key)
4. Background signs preparedTransactionHash locally
5. Background submits {preparedTransaction, signature} to dapp-core -> Canton Ledger
```

#### Wallet Gateway (JSON-RPC 2.0)

The extension talks to the Gateway for **CIP-0103 dApp API operations** and **wallet onboarding**. Requests use a self-signed HS256 JWT (not the dapp-core token) and require an active session via `addSession`.

| API | Method | Description |
| --- | --- | --- |
| **User API** | `addSession` | Establish Gateway session (required before all other calls) |
| | `createWallet` | Create new wallet + allocate partyId during onboarding |
| | `getTransaction` | Get pending transaction details (hash, prepared tx) |
| | `execute` | Submit signed transaction to Canton Ledger |
| | `deleteTransaction` | Clean up rejected pending transaction |
| **dApp API** | `prepareExecute` | Forward Daml commands to Canton, return pending tx |
| | `ledgerApi` | Proxy GET/POST requests to Canton Ledger API |

**Gateway client** (`gateway-client.ts`):

- Separate Axios instance from the dapp-core client
- Self-signed JWT: HS256, `sub: "ledger-api-user"`, no `typ` header, configurable per network
- Session lifecycle: `ensureGatewaySession()` called automatically before every RPC call
- Two RPC helpers: `gatewayDappRpc()` (dApp API at `/api/v0/dapp`) and `gatewayUserRpc()` (User API at `/api/v0/user`)

### CIP-0103 dApp API

The extension implements the Canton CIP-0103 standard for dApp-wallet communication via `window.postMessage`:

| Method | Status | Description |
| --- | --- | --- |
| `connect` | Implemented | Check wallet readiness |
| `disconnect` | Implemented | Acknowledge disconnect |
| `isConnected` | Implemented | Alias for connect |
| `status` | Implemented | Provider info, connection, network, session |
| `getActiveNetwork` | Implemented | Current network config |
| `listAccounts` | Implemented | List wallet accounts |
| `getPrimaryAccount` | Implemented | Primary account details |
| `signMessage` | Implemented | Sign arbitrary message |
| `signTransaction` | Implemented | Sign transaction hash |
| `prepareExecute` | Implemented | Full tx lifecycle via Gateway |
| `prepareExecuteAndWait` | Implemented | Same, returns execution result |
| `ledgerApi` | Implemented | Proxy to Gateway Ledger API |

### prepareExecute Flow

```text
1. dApp calls prepareExecute(command) via CIP-0103
2. Extension forwards to Wallet Gateway dApp API
3. Gateway calls Canton Ledger API /v2/interactive-submission/prepare
4. Gateway stores pending tx, returns userUrl with commandId
5. Extension shows approval popup to user
6. User approves -> extension signs preparedTransactionHash locally
7. Extension calls Gateway User API execute(commandId, signature)
8. Gateway submits to Canton with partySignatures
9. Extension returns result to dApp
```

### Signing Relay

The signing relay bridges Wallet Gateway signing requests to extension-held keys:

```text
1. Extension connects to relay via Socket.io on wallet unlock
2. Extension registers public keys with relay
3. Gateway calls relay HTTP API: POST /signTransaction
4. Relay emits sign-request to connected extension
5. Extension shows approval popup, signs, emits sign-response
6. Relay returns signature to Gateway
```

The relay implements a Blockdaemon-compatible HTTP API so the Gateway treats it like any standard signing provider.

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
|  Decrypts key only when signing.     |  Signs transaction hashes.
|  Makes all API calls.                |  Manages auth tokens.
|  Auto-locks after timeout.           |  Caches decrypted key in memory while unlocked.
|  Connects to signing relay.          |  Handles CIP-0103 dApp API requests.
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

The wallet supports four networks, selectable at runtime via a dropdown in the dashboard header:

| Network | dapp-core API | Gateway URL | Signing Relay | Explorer | Faucet |
| --- | --- | --- | --- | --- | --- |
| Localnet | `http://localhost:3003/` | `http://localhost:3030` | `http://localhost:4100` | -- | Yes |
| Devnet | -- | -- | -- | -- | Yes |
| Testnet | -- | -- | -- | -- | No |
| Mainnet | -- | -- | -- | -- | No |

Localnet includes a `gatewayAuth` config for self-signed JWT generation: `{networkId: "canton:localnet", idpIssuer: "unsafe-auth", clientId: "ledger-api-user", clientSecret: "unsafe"}`. Other networks do not yet have Gateway URLs configured.

Network selection is persisted in a global (non-namespaced) `chrome.storage.local` key. Switching networks clears the session (auth tokens, party ID), disconnects the signing relay, resets the Gateway session, and returns the user to the Welcome/Unlock screen.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | -- | Google OAuth client ID |
| `VITE_ENCRYPTION_BACKEND` | `webcrypto` | `webcrypto` or `cryptojs` |
| `VITE_SALT_ROUNDS` | `10` | bcrypt salt rounds (cryptojs backend only) |
| `VITE_AUTO_LOCK_MINUTES` | `15` | Auto-lock timeout in minutes |

> **Note:** API, Gateway, and explorer URLs are determined at runtime by the selected network (see [Network Configuration](#network-configuration)).

---

## Project Structure

```text
ginkgo/
|-- wxt.config.ts                 # WXT config: manifest, Vite aliases
|-- tsconfig.json                 # TypeScript config with path aliases
|-- postcss.config.js             # Tailwind CSS 4 PostCSS plugin
|-- package.json
|-- .env.example
|
|-- public/icon/                  # Extension icons (16/32/48/96/128 png)
|-- assets/icons/                 # SVG icon components (Canton, CBTC, USDCx, etc.)
|
|-- entrypoints/
|   |-- background.ts             # Service worker: message router, network init, migrations
|   |-- content.ts                # CIP-0103 content script bridge (postMessage <-> chrome.runtime)
|   |-- background/
|   |   |-- api-client.ts         # Axios instance for dapp-core (setApiBaseUrl)
|   |   |-- gateway-client.ts     # Axios instance for Wallet Gateway (JSON-RPC 2.0)
|   |   |-- handlers/
|   |   |   |-- dapp-api.handler.ts    # CIP-0103 method dispatch (all 11 methods)
|   |   |   |-- auth.handler.ts        # Google OAuth, token refresh, logout
|   |   |   |-- signing.handler.ts     # Key decrypt + transaction signing
|   |   |   |-- keystore.handler.ts    # Key gen, import, encrypt, store, onboarding, pre-approval
|   |   |   |-- network.handler.ts     # Get/switch network, update clients + relay
|   |   |   |-- api.handler.ts         # Proxied API calls (balances, offers, etc.)
|   |   |   |-- session.handler.ts     # Lock/unlock, auto-lock, key cache, relay connect
|   |   |   |-- approval.handler.ts    # MetaMask-style approval popups
|   |   |   '-- event-broadcaster.ts   # Push statusChanged/accountsChanged to dApps
|   |   |-- signing-relay/
|   |   |   '-- relay-client.ts        # Socket.io client for signing relay
|   |   '-- encryption/
|   |       |-- types.ts              # EncryptionProvider interface
|   |       |-- webcrypto.ts          # PBKDF2 + AES-256-GCM
|   |       |-- cryptojs.ts           # CryptoJS AES (web app compatible)
|   |       '-- index.ts             # Facade: selects backend via env var
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
|   |           |-- Activity.tsx  # Paginated tx history
|   |           '-- offers/       # Incoming/Outgoing/History tabs
|   |
|   '-- options/                  # Full-tab settings page
|       |-- main.tsx
|       '-- App.tsx               # Key export (Base64/Hex), encryption info
|
|-- lib/                          # Shared code (popup + background)
|   |-- network.ts                # NetworkId type, NetworkConfig (with gateway/relay URLs)
|   |-- dapp-api/
|   |   |-- types.ts              # CIP-0103 SpliceMessage types, JSON-RPC helpers
|   |   '-- gateway-types.ts      # Wallet Gateway request/response types
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
|   '-- signing-relay/            # Signing relay service (standalone)
|       |-- package.json
|       |-- tsconfig.json
|       |-- Dockerfile
|       '-- src/
|           |-- index.ts          # Express + Socket.io server (port 4100)
|           |-- http-api.ts       # Blockdaemon-compatible HTTP endpoints
|           |-- socket-handler.ts # Socket.io connection/event handling
|           '-- types.ts          # Shared signing types
|
|-- docs/
|   |-- pattern-a-implementation-checklist.md  # Implementation progress tracker
|   |-- dapp-connectivity-plan.md              # CIP-0103 design doc
|   |-- hybrid-signing-plan.md                 # Signing approach analysis
|   '-- ...
|
|-- components/
|   '-- common/
|       '-- ErrorBoundary.tsx     # React error boundary
|
'-- styles/
    |-- globals.css               # Popup: Tailwind + dark theme + 400x600 sizing
    '-- options.css               # Options page: Tailwind + dark theme (no fixed size)
```

---

## Signing Relay Service

Located at `tools/signing-relay/`. A standalone Node.js service that bridges the Wallet Gateway's Blockdaemon signing driver to the Ginkgo extension.

### Setup

```bash
cd tools/signing-relay
npm install
npm run dev     # Development with hot reload
npm start       # Production
```

### HTTP API (Blockdaemon-compatible)

| Endpoint | Description |
| --- | --- |
| `POST /signTransaction` | Forward signing request to connected extension |
| `POST /getTransaction` | Get transaction signing status |
| `POST /getTransactions` | Get multiple transaction statuses |
| `POST /getKeys` | List registered public keys |
| `POST /createKey` | Register a new key |
| `GET /health` | Health check |

### Socket.io Protocol

| Event | Direction | Payload |
| --- | --- | --- |
| `register-keys` | extension -> relay | `{ keys: [{ id, name, publicKey }] }` |
| `sign-request` | relay -> extension | `{ txId, tx, txHash, keyIdentifier, internalTxId? }` |
| `sign-response` | extension -> relay | `{ txId, signature, publicKey, status }` |

### Docker

```bash
docker build -t signing-relay .
docker run -p 4100:4100 signing-relay
```

---

## Backend API (dapp-core)

The extension talks to **dapp-core** for authentication, token data, offer management, transfers, faucet, and activity history. See [Interaction Flow by Backend](#interaction-flow-by-backend) for the complete endpoint list.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/login-with-google`, `POST /auth/refresh-token`, `GET /auth/me` |
| Party registration | `POST /auth/register-party` (links partyId to user after Gateway onboarding) |
| Token balances | `GET /wallet/token-balance` |
| Transfers (Amulet) | `POST /external-party/transfer-amulet/{prepare,submit}` |
| Offers (Token Standard) | `POST /offers/{prepare,submit}`, `GET /offers/{incoming,outgoing,history}-requests` |
| Offer actions | `POST /offers/{approve,reject,withdraw}/{prepare,submit}` |
| Faucet | `POST /external-party/devnet-tap/{prepare,submit}` |
| Activity | `GET /external-party/tx-history` |

---

## Message Protocol

All privileged operations go through typed messages (`lib/messaging/`). The popup never directly accesses storage or makes API calls.

| Category | Actions | Handler |
| --- | --- | --- |
| Auth | `GOOGLE_AUTH`, `REFRESH_TOKEN`, `LOGOUT`, `GET_AUTH_STATE` | `auth.handler.ts` |
| Session | `UNLOCK`, `LOCK`, `GET_LOCK_STATE` | `session.handler.ts` |
| Keystore | `CREATE_KEYPAIR`, `VALIDATE_IMPORT_KEY`, `PREPARE_ONBOARDING`, `COMPLETE_ONBOARDING`, `EXPORT_PRIVATE_KEY`, `DELETE_KEYSTORE` | `keystore.handler.ts` |
| Signing | `SIGN_AND_SUBMIT_TRANSFER_PREAPPROVAL`, `SIGN_AND_SUBMIT_TRANSFER_TOKEN_STANDARD`, `SIGN_AND_SUBMIT_APPROVE`, `SIGN_AND_SUBMIT_REJECT`, `SIGN_AND_SUBMIT_WITHDRAW` | `signing.handler.ts` |
| Network | `GET_NETWORK`, `SWITCH_NETWORK` | `network.handler.ts` |
| Transfer pre-approval | `REGISTER_TRANSFER_PREAPPROVAL`, `GET_PREAPPROVAL_STATUS` | `keystore.handler.ts` |
| API proxy | `FETCH_BALANCES`, `PREPARE_TRANSFER_*`, `FETCH_INCOMING_OFFERS`, `FETCH_OUTGOING_OFFERS`, `FETCH_HISTORY_OFFERS`, `PREPARE_APPROVE`, `PREPARE_REJECT`, `PREPARE_WITHDRAW`, `FETCH_ACTIVITY`, `FETCH_ABOUT_ME`, `REQUEST_FAUCET` | `api.handler.ts` |
| dApp approval | `GET_DAPP_APPROVAL`, `DAPP_APPROVAL_RESULT` | `approval.handler.ts` |

---

## User Flows

### Onboarding (New User)

```text
Welcome -> Google sign-in
  |  (1) POST /auth/login-with-google -> dapp-core
  |  (2) GET /auth/me -> get party status
  -> CreatePassword (8+ chars, upper, lower, digit, special)
  -> KeySetup (auto-generate key pair)
  -> ShowPrivateKey (reveal, copy, backup)
  -> Acknowledgment (3 checkbox confirmations)
  -> TypedConfirm:
       (3) Connect to Signing Relay (Socket.io, before partyId exists)
       (4) Enable auto-approve for relay sign requests
       (5) Gateway User API: createWallet({partyHint, signingProviderId})
           -> Gateway initiates Canton topology tx
           -> Gateway calls Signing Relay: POST /signTransaction
           -> Relay emits sign-request to extension
           -> Extension auto-signs, emits sign-response
           -> Gateway completes onboarding, returns partyId
       (6) POST /auth/register-party -> dapp-core (links partyId to user)
       (7) Disable auto-approve
       (8) Reconnect relay with real partyId
  -> Dashboard
```

### Returning User

```text
Welcome -> Google sign-in (dapp-core)
  -> Unlock (enter password)
       (1) Decrypt + cache private key in memory
       (2) Connect to Signing Relay with partyId
       (3) Register public key with relay
  -> Dashboard
```

### dApp Transaction (CIP-0103 prepareExecute)

```text
dApp calls prepareExecute(commands) via window.postMessage
  -> Content script relays to background via chrome.runtime
  -> Background:
       (1) Gateway dApp API: prepareExecute(commands) -> {userUrl, commandId}
       (2) Show approval popup to user
       (3) IF rejected: Gateway User API deleteTransaction(commandId) -> return error
       (4) IF approved:
           Gateway User API: getTransaction(commandId) -> {preparedTransactionHash}
           Sign hash locally with cached private key
           Gateway User API: execute(commandId, signature, signedBy)
  -> Result returned to dApp via postMessage
```

### Transfer (Popup-Driven via dapp-core)

```text
Dashboard -> Send tab -> Select token + recipient + amount
  -> IF Amulet:
       (1) dapp-core: POST /external-party/transfer-amulet/prepare
       (2) Enter password -> decrypt key -> sign hash locally
       (3) dapp-core: POST /external-party/transfer-amulet/submit
  -> IF CBTC/USDCx (Token Standard):
       (1) dapp-core: POST /offers/prepare
       (2) Enter password -> decrypt key -> sign hash locally
       (3) dapp-core: POST /offers/submit
```

### Offer Actions (Popup-Driven via dapp-core)

```text
Incoming offer -> Approve/Reject:
  (1) dapp-core: POST /offers/{approve,reject}/prepare
  (2) Enter password -> sign locally
  (3) dapp-core: POST /offers/{approve,reject}/submit

Outgoing offer -> Withdraw:
  (1) dapp-core: POST /offers/withdraw/prepare
  (2) Enter password -> sign locally
  (3) dapp-core: POST /offers/withdraw/submit
```

### Faucet (DevNet only, via dapp-core)

```text
Token detail -> Tap Faucet:
  (1) dapp-core: POST /external-party/devnet-tap/prepare -> {hash, preparedTx}
  (2) Sign hash locally (use cached key or decrypt with password)
  (3) dapp-core: POST /external-party/devnet-tap/submit -> Canton Ledger
```

### Gateway-Initiated Signing (via Signing Relay)

```text
Wallet Gateway needs a signature (e.g. during createWallet):
  (1) Gateway calls relay HTTP API: POST /signTransaction({txHash, keyIdentifier})
  (2) Relay emits 'sign-request' to connected extension via Socket.io
  (3) Extension shows approval popup (or auto-approves during onboarding)
  (4) Extension signs txHash locally, emits 'sign-response' back to relay
  (5) Relay returns signature to Gateway via HTTP response
```

### Network Switching

```text
Dashboard -> Header network dropdown
  -> Select different network
  -> Session cleared (auth tokens, partyId)
  -> Signing relay disconnected
  -> Gateway session reset
  -> dapp-core API base URL updated
  -> Gateway URL + auth config updated
  -> App returns to Welcome/Unlock
  -> Previous network's data preserved in isolated storage
```

---

## Token Configuration

| Token | Symbol | Decimals | Min Amount |
| --- | --- | --- | --- |
| Amulet | CC | 5 | 10 |
| Canton Bitcoin | CBTC | 8 | 0.00001 |
| Canton USD Coin | USDCx | 5 | 1 |

---

## Security Notes

- **Key isolation**: Private keys exist only in the background service worker. The popup never has access.
- **In-memory key caching**: During an unlocked session, the decrypted private key is cached in the service worker's memory for passwordless signing (CIP-0103, relay). The cache is cleared on lock/logout.
- **Dual auth tokens**: dapp-core uses Google OAuth JWT (session storage). Gateway uses a self-signed HS256 JWT generated locally — never sent to dapp-core.
- **Signing relay security**: The relay authenticates connections via partyId. Signing requests always show an approval popup before the extension signs. Auto-approve is only enabled temporarily during onboarding.
- **Key fingerprint verification**: Before signing, the handler verifies that the private key's Canton fingerprint (`0x1220 || SHA256(int32_be(12) || pubkey)`) matches the partyId's namespace to prevent signing with a mismatched key.
- **Auto-clear**: Exported private keys are automatically cleared from UI state after 30 seconds.
- **Auto-lock**: Wallet locks after configurable timeout (default 15 min). All session data, cached keys, relay connections, and Gateway sessions are wiped.
- **No localStorage**: Auth tokens use `chrome.storage.session` (memory-only, cleared on browser close).
- **Per-user isolation**: Keystores are scoped by `{network}:{userId}:keystore`, preventing data leaks between accounts or networks.
- **dApp approval**: All sensitive CIP-0103 methods (`connect`, `signMessage`, `signTransaction`, `prepareExecute`, `prepareExecuteAndWait`) require explicit user approval via a popup window.
- **Transaction cleanup**: Rejected `prepareExecute` transactions are cleaned up via Gateway `deleteTransaction` to avoid orphaned pending state.
- **No XSS vectors**: No use of `dangerouslySetInnerHTML`, `eval`, or dynamic script injection.

---

## Manifest Permissions

```json
{
  "permissions": ["storage", "identity", "alarms"],
  "host_permissions": [
    "https://accounts.google.com/*"
  ]
}
```

| Permission | Reason |
| --- | --- |
| `storage` | Encrypted keystore (`chrome.storage.local`) and session tokens (`chrome.storage.session`) |
| `identity` | Google OAuth via `chrome.identity.launchWebAuthFlow()` |
| `alarms` | Auto-lock timer and signing relay keepalive |

---

## Path Aliases

Configured in both `wxt.config.ts` (Vite) and `tsconfig.json`:

| Alias | Path |
| --- | --- |
| `@/` | Project root |
| `@lib/` | `lib/` |
| `@components/` | `components/` |
| `@assets/` | `assets/` |

---

## Tech Stack

| Layer | Choice |
| --- | --- |
| Framework | WXT 0.20 (Vite-based, MV3) |
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS 4 + Radix UI |
| Server State | TanStack React Query |
| Forms | React Hook Form + Zod |
| HTTP | Axios |
| WebSocket | socket.io-client |
| Crypto | `@canton-network/core-signing-lib` |
| Encryption | Web Crypto API / CryptoJS |
| Icons | lucide-react |
| Math | BigNumber.js |

---

## Scripts

| Command | Description |
| --- | --- |
| `yarn dev` | Dev server with hot reload (Chrome) |
| `yarn dev:firefox` | Dev server with hot reload (Firefox) |
| `yarn build` | Production build for Chrome |
| `yarn build:firefox` | Production build for Firefox |
| `yarn build:all` | Build both Chrome and Firefox |
| `yarn zip` | Package Chrome extension as .zip |
| `yarn zip:firefox` | Package Firefox extension as .zip |
| `yarn typecheck` | Run TypeScript type checking |
| `yarn lint` | Run ESLint |
| `yarn format` | Run Prettier |
