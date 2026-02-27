# Canton Wallet

A secure browser extension wallet for the **Canton Network (Kairo)**. Supports token management, transfers, offer approvals, and activity history — all backed by the same API as the [Canton Exchange Frontend](../canton-exchange-frontend).

Built with [WXT](https://wxt.dev), React 19, TypeScript, and Tailwind CSS 4.

---

## Features

- **Google OAuth sign-in** via `chrome.identity.launchWebAuthFlow()`
- **Multi-network support** — Runtime switching between Devnet, Testnet, and Mainnet with color-coded dropdown
- **Per-user, per-network storage isolation** — Each user's keystore and onboarding state is scoped by `{network}:{userId}`, so switching networks or accounts never leaks data
- **Token balances** — Amulet/CC, CBTC, USDCx with locked/unlocked breakdown
- **Transfers** — Dual-path: Amulet (transfer-preapproval) and CBTC/USDCx (token-standard), with per-token balance display and MAX button
- **Transfer pre-approval** — Auto-registered after onboarding; manual registration via dashboard banner if missing
- **Offers** — Incoming (approve/reject), Outgoing (read-only), History
- **Activity** — Paginated transaction history with dynamic block explorer links (per-network)
- **Smart onboarding** — Detects returning users (existing public key on backend) and routes to key import instead of generation
- **Auto-lock** — Configurable timer (default 15 min) using `chrome.alarms`
- **In-memory key caching** — Private key cached in background service worker during unlocked session for passwordless signing of auto-approval and pre-approval operations
- **Dual encryption** — Web Crypto API (PBKDF2 + AES-256-GCM) or CryptoJS AES, selectable at build time
- **Key isolation** — Private keys never leave the background service worker
- **Key export** — Base64 or Hex format toggle on options page
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

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
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
yarn build          # Chrome production build → .output/chrome-mv3/
yarn build:firefox  # Firefox production build → .output/firefox-mv2/
yarn build:all      # Both
```

### Package for Distribution

```bash
yarn zip            # Chrome .zip
yarn zip:firefox    # Firefox .zip
```

### Load Manually

- **Chrome**: `chrome://extensions` → Enable Developer mode → Load unpacked → select `.output/chrome-mv3/`
- **Firefox**: `about:debugging` → This Firefox → Load Temporary Add-on → select `.output/firefox-mv2/manifest.json`

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values:

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | — | Google OAuth client ID |
| `VITE_ENCRYPTION_BACKEND` | `webcrypto` | `webcrypto` or `cryptojs` |
| `VITE_SALT_ROUNDS` | `10` | bcrypt salt rounds (cryptojs backend only) |
| `VITE_AUTO_LOCK_MINUTES` | `15` | Auto-lock timeout in minutes |

> **Note:** `VITE_API_BASE_URL` and `VITE_EXPLORER_LINK` are no longer needed. API and explorer URLs are now determined at runtime by the selected network (see [Network Configuration](#network-configuration)).

---

## Network Configuration

The wallet supports three networks, selectable at runtime via a dropdown in the dashboard header:

| Network | Dot Color | API URL | Explorer URL |
| --- | --- | --- | --- |
| Devnet | Blue | `https://api-devnet.kairo.ag/` | `https://lighthouse.devnet.cantonloop.com` |
| Testnet | Yellow | `https://api-testnet.kairo.ag/` | `https://lighthouse.testnet.cantonloop.com` |
| Mainnet | Green | `https://api.kairo.ag/` | `https://lighthouse.cantonloop.com` |

Network selection is persisted in a global (non-namespaced) `chrome.storage.local` key. Switching networks clears the session (auth tokens, party ID) and returns the user to the Welcome/Unlock screen. Each network maintains its own isolated keystore and onboarding state.

---

## Architecture

### Security Model

```text
┌──────────────────────────────────────┐
│           POPUP (React UI)           │  Renders UI, collects user input.
│  Never has access to private keys.   │  Sends password + tx hash to sign.
│  Receives only signatures back.      │  All API data fetched via messages.
└──────────────┬───────────────────────┘
               │ chrome.runtime.sendMessage
               ▼
┌──────────────────────────────────────┐
│     BACKGROUND SERVICE WORKER        │  Holds encrypted key in chrome.storage.local.
│  Decrypts key only when signing.     │  Signs transaction hashes.
│  Makes all API calls.                │  Manages auth tokens.
│  Auto-locks after timeout.           │  Caches decrypted key in memory while unlocked.
└──────────────────────────────────────┘
```

**Private keys NEVER appear in popup context.** The popup sends `{ password, hashToSign }` to the service worker; the service worker decrypts, signs, and returns only the signature.

### Dual Encryption Backends

Controlled by `VITE_ENCRYPTION_BACKEND`:

| | **webcrypto** (default) | **cryptojs** |
| --- | --- | --- |
| Key derivation | PBKDF2, 100k iterations, SHA-256 | bcrypt |
| Encryption | AES-256-GCM, 12-byte IV | CryptoJS AES |
| Authentication | GCM auth tag (built-in) | — |
| Salt | Random 16 bytes | bcrypt salt |
| Compatibility | Extension-native | Web app compatible |

Both implement the same `EncryptionProvider` interface:

```typescript
interface EncryptionProvider {
  encryptKey(privateKey: string, password: string): Promise<EncryptedKeyBundle>;
  decryptKey(bundle: EncryptedKeyBundle, password: string): Promise<string>;
  verifyPassword(bundle: EncryptedKeyBundle, password: string): Promise<boolean>;
}
```

### Storage

| Store | API | Persistence | Contents |
| --- | --- | --- | --- |
| `chrome.storage.local` (namespaced) | `localStore` | Survives restart | Encrypted keystore, user profile, settings, onboarding flag — prefixed with `{network}:{userId}:` or `{network}:` |
| `chrome.storage.local` (global) | `networkStore` | Survives restart | Selected network ID (`selectedNetwork` key, not namespaced) |
| `chrome.storage.session` | `sessionStore` | Memory-only | Auth tokens, party ID, lock state, last activity timestamp |

**Storage key format:**

- User-scoped keys (keystore, onboardingComplete): `{network}:{userId}:{key}` — e.g., `mainnet:abc123:keystore`
- Network-scoped keys (user profile, settings): `{network}:{key}` — e.g., `devnet:user`
- Global keys: `selectedNetwork` (no prefix)

**Migrations:** On first load, legacy unnamespaced keys are automatically migrated to `devnet:*` prefixed keys. A second migration moves network-only-scoped user data to per-user keys.

### Message Protocol

All privileged operations go through typed messages (`lib/messaging/`). The popup never directly accesses storage or makes API calls.

| Category | Actions | Handler |
| --- | --- | --- |
| Auth | `GOOGLE_AUTH`, `REFRESH_TOKEN`, `LOGOUT`, `GET_AUTH_STATE` | `auth.handler.ts` |
| Session | `UNLOCK`, `LOCK`, `GET_LOCK_STATE` | `session.handler.ts` |
| Keystore | `CREATE_KEYPAIR`, `VALIDATE_IMPORT_KEY`, `PREPARE_ONBOARDING`, `COMPLETE_ONBOARDING`, `EXPORT_PRIVATE_KEY`, `DELETE_KEYSTORE` | `keystore.handler.ts` |
| Signing | `SIGN_AND_SUBMIT_TRANSFER_PREAPPROVAL`, `SIGN_AND_SUBMIT_TRANSFER_TOKEN_STANDARD`, `SIGN_AND_SUBMIT_APPROVE`, `SIGN_AND_SUBMIT_REJECT` | `signing.handler.ts` |
| Network | `GET_NETWORK`, `SWITCH_NETWORK` | `network.handler.ts` |
| Transfer pre-approval | `REGISTER_TRANSFER_PREAPPROVAL`, `GET_PREAPPROVAL_STATUS` | `keystore.handler.ts` |
| API proxy | `FETCH_BALANCES`, `FETCH_PRICES`, `PREPARE_TRANSFER_*`, `FETCH_INCOMING_OFFERS`, `FETCH_OUTGOING_OFFERS`, `FETCH_HISTORY_OFFERS`, `PREPARE_APPROVE`, `PREPARE_REJECT`, `FETCH_ACTIVITY`, `FETCH_ABOUT_ME`, `REQUEST_FAUCET` | `api.handler.ts` |

### Signing Flow

Every state-changing operation follows the **prepare → sign → submit** pattern:

1. Popup sends `PREPARE_*` → background calls backend prepare endpoint → returns `preparedTransactionHash`
2. Popup shows password prompt → user enters password
3. Popup sends `SIGN_AND_SUBMIT_*` with `{ password, preparedTransactionHash, ... }`
4. Background decrypts key → `signTransactionHash(hash, privateKey)` → calls submit endpoint → returns `{ success }`
5. Plaintext key immediately dereferenced

---

## Project Structure

```text
canton-wallet/
├── wxt.config.ts                 # WXT config: manifest, Vite aliases
├── tsconfig.json                 # TypeScript config with path aliases
├── postcss.config.js             # Tailwind CSS 4 PostCSS plugin
├── package.json
├── .env.example
│
├── public/icon/                  # Extension icons (16/32/48/96/128 png)
├── assets/icons/                 # SVG icon components (Canton, CBTC, USDCx, etc.)
│
├── entrypoints/
│   ├── background.ts             # Service worker: message router, network init, migrations
│   ├── background/
│   │   ├── api-client.ts         # Axios instance with dynamic baseURL (setApiBaseUrl)
│   │   ├── handlers/
│   │   │   ├── auth.handler.ts       # Google OAuth, token refresh, logout
│   │   │   ├── signing.handler.ts    # Key decrypt + transaction signing
│   │   │   ├── keystore.handler.ts   # Key gen, import, encrypt, store, onboarding, pre-approval
│   │   │   ├── network.handler.ts    # Get/switch network, update API client + storage prefix
│   │   │   ├── api.handler.ts        # Proxied API calls (balances, offers, etc.)
│   │   │   └── session.handler.ts    # Lock/unlock, auto-lock timer, in-memory key cache
│   │   └── encryption/
│   │       ├── types.ts              # EncryptionProvider interface
│   │       ├── webcrypto.ts          # PBKDF2 + AES-256-GCM
│   │       ├── cryptojs.ts           # CryptoJS AES (web app compatible)
│   │       └── index.ts             # Facade: selects backend via env var
│   │
│   ├── popup/                    # Main wallet UI (400 x 600px)
│   │   ├── main.tsx              # React root with QueryClient + ErrorBoundary
│   │   ├── App.tsx               # State-machine navigation (smart onboarding routing)
│   │   ├── hooks/                # Typed hooks bridging popup ↔ background
│   │   │   ├── useMessage.ts         # Generic sendMessage wrapper
│   │   │   ├── useAuth.ts            # Auth state, Google sign-in, logout
│   │   │   ├── useLockState.ts       # Lock/unlock state
│   │   │   ├── useWallet.ts          # Key create, import, export, onboarding, pre-approval
│   │   │   ├── useBalances.ts        # Token balances + prices (auto-refetch)
│   │   │   ├── useTransfer.ts        # Transfer prepare + sign+submit
│   │   │   ├── useOffers.ts          # Incoming/outgoing/history + approve/reject
│   │   │   ├── useActivity.ts        # Transaction history
│   │   │   └── useNetwork.ts         # Network state + switch mutation
│   │   └── pages/
│   │       ├── onboarding/
│   │       │   ├── Welcome.tsx           # Google sign-in
│   │       │   ├── CreatePassword.tsx    # Password with 5 validation rules + reset button
│   │       │   ├── KeySetup.tsx          # Create new or import existing
│   │       │   ├── ShowPrivateKey.tsx    # Reveal, copy, backup warning
│   │       │   ├── Acknowledgment.tsx    # 3 checkbox confirmations
│   │       │   └── TypedConfirm.tsx      # Type confirmation → prepare/submit onboarding
│   │       ├── Unlock.tsx               # Password entry for returning users
│   │       └── dashboard/
│   │           ├── index.tsx            # Tab container + network dropdown + account info
│   │           ├── Balances.tsx         # Token balances + pre-approval banner
│   │           ├── Transfer.tsx         # 3-step: form → confirm → success (with balance/MAX)
│   │           ├── Settings.tsx         # PartyId, export key, lock, logout
│   │           ├── Activity.tsx         # Paginated tx history (dynamic explorer links)
│   │           └── offers/
│   │               ├── index.tsx        # Incoming/Outgoing/History tabs
│   │               ├── IncomingTab.tsx  # Approve/reject with password
│   │               ├── OutgoingTab.tsx  # Read-only locked offers
│   │               └── HistoryTab.tsx   # Status-colored history
│   │
│   └── options/                  # Full-tab settings page
│       ├── main.tsx
│       └── App.tsx               # Key export (Base64/Hex), encryption info, about (dynamic network)
│
├── lib/                          # Shared code (popup + background)
│   ├── network.ts                # NetworkId type, NetworkConfig, NETWORKS record
│   ├── messaging/
│   │   ├── constants.ts          # MSG action string constants
│   │   ├── types.ts              # Discriminated union request/response types
│   │   ├── protocol.ts           # sendMessage(), ok(), err() helpers
│   │   └── index.ts
│   ├── storage/
│   │   ├── schemas.ts            # Zod validation schemas
│   │   ├── local.ts              # Namespaced chrome.storage.local wrapper + migrations
│   │   ├── session.ts            # Typed chrome.storage.session wrapper
│   │   ├── network.ts            # Global network selection store (non-namespaced)
│   │   └── index.ts
│   ├── types/                    # Shared API types (ported from web app)
│   │   ├── api.ts                # ApiResponse<T>, PaginatedResponse<T>
│   │   ├── auth.ts               # User, LoginResponse, PrepareExternalParty
│   │   ├── transfer.ts           # Transfer prepare/submit interfaces
│   │   ├── offers.ts             # Offer request/response interfaces
│   │   ├── activity.ts           # ActivityResponse
│   │   ├── tokens.ts             # TokenType, BalanceSwapResponse, PriceFeedResponse
│   │   └── index.ts
│   ├── constants.ts              # Token defs, query keys, TYPO_TEXT
│   ├── format.ts                 # Currency/address/date formatting
│   └── utils.ts                  # cn(), sleep(), onCopyText(), base64/hex conversion
│
├── components/
│   └── common/
│       └── ErrorBoundary.tsx     # React error boundary
│
└── styles/
    ├── globals.css               # Popup: Tailwind + dark theme + 400x600 sizing
    └── options.css               # Options page: Tailwind + dark theme (no fixed size)
```

---

## Shared Backend API

The extension talks to the **same backend** as `canton-exchange-frontend`. The API URL is determined dynamically by the selected network (see [Network Configuration](#network-configuration)).

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/login-with-google`, `POST /auth/refresh-token`, `GET /auth/me` |
| Onboarding | `POST /external-party/onboarding/prepare`, `POST /external-party/onboarding/submit` |
| Auto-approval | `GET /auto-approval/{partyId}`, `POST /auto-approval/prepare`, `POST /auto-approval/submit` |
| Balances | `GET /swap/token-balance`, `GET /swap/token-prices` |
| Transfer (Amulet) | `POST /external-party/transfer-preapproval/prepare`, `POST /external-party/transfer-preapproval/submit` |
| Transfer (CBTC/USDCx) | `POST /transfer-token-standard/prepare`, `POST /transfer-token-standard/submit` |
| Offers | `GET /transfer-token-standard/incoming-requests`, `GET /transfer-token-standard/outgoing-requests`, `GET /transfer-token-standard/history` |
| Approve/Reject | `POST /transfer-token-standard/approve/prepare\|submit`, `POST /transfer-token-standard/reject/prepare\|submit` |
| Activity | `GET /external-party/tx-history` |
| Faucet | `POST /external-party/request-faucet` |

---

## User Flows

### Onboarding (New User)

```text
Welcome → Google sign-in
  → CreatePassword (8+ chars, upper, lower, digit, special)
  → KeySetup (auto-generate key pair)
  → ShowPrivateKey (reveal, copy, backup)
  → Acknowledgment (3 checkbox confirmations)
  → TypedConfirm (type exact confirmation phrase)
  → Background: encrypt key → onboarding prepare/sign/submit
  → Background: fetch partyId from /auth/me → auto-register transfer pre-approval
  → Background: request faucet
  → Dashboard
```

### Onboarding (Returning User with Existing Key)

If `/auth/me` returns a user with an existing `publicKey` (even if `onboardingStatus=PENDING`), the wallet detects this and routes directly to key import instead of generating a new key pair.

```text
Welcome → Google sign-in
  → CreatePassword
  → KeySetup (import existing private key — public key pre-filled from backend)
  → Acknowledgment
  → TypedConfirm → onboarding submit → auto-register pre-approval
  → Dashboard
```

### Returning User

```text
Welcome → Google sign-in → Unlock (password) → Dashboard
```

### Transfer

```text
Dashboard → Send tab → Select token (shows available/locked balance) + recipient + amount (MAX button)
  → IF Amulet: PREPARE_TRANSFER_PREAPPROVAL
  → IF CBTC/USDCx: PREPARE_TRANSFER_TOKEN_STANDARD
  → Enter password → SIGN_AND_SUBMIT → Success
```

### Transfer Pre-Approval

Transfer pre-approval is required to receive Amulet transfers. It is automatically registered after onboarding. If missing (e.g., onboarding occurred before this feature), a yellow warning banner appears on the Balances tab with a manual registration button. A green success toast is shown for 5 seconds after successful registration.

### Offer Approval

```text
Dashboard → Offers tab → Incoming
  → Approve or Reject → PREPARE_APPROVE/REJECT
  → Enter password → SIGN_AND_SUBMIT_APPROVE/REJECT → Updated
```

### Network Switching

```text
Dashboard → Header network dropdown (colored dot: blue/yellow/green)
  → Select different network
  → Session cleared → App returns to Welcome/Unlock for the new network
  → Previous network's data preserved in isolated storage
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
- **In-memory key caching**: During an unlocked session, the decrypted private key is cached in the service worker's memory for passwordless operations (auto-approval registration). The cache is cleared on lock/logout.
- **Auto-clear**: Exported private keys are automatically cleared from UI state after 30 seconds.
- **Onboarding wipe**: Password and key data are cleared from React state immediately after onboarding completes.
- **Auto-lock**: Wallet locks after configurable timeout (default 15 min). All session data and cached keys are wiped.
- **No localStorage**: Auth tokens use `chrome.storage.session` (memory-only, cleared on browser close).
- **Per-user isolation**: Keystores are scoped by `{network}:{userId}:keystore`, preventing data leaks between accounts or networks.
- **Error boundary**: React ErrorBoundary wraps both popup and options page to prevent crash-induced state leaks.
- **No XSS vectors**: No use of `dangerouslySetInnerHTML`, `eval`, or dynamic script injection.

---

## Manifest Permissions

```json
{
  "permissions": ["storage", "identity", "alarms"],
  "host_permissions": [
    "https://accounts.google.com/*",
    "https://*.kairo.ag/*"
  ]
}
```

| Permission | Reason |
| --- | --- |
| `storage` | Encrypted keystore (`chrome.storage.local`) and session tokens (`chrome.storage.session`) |
| `identity` | Google OAuth via `chrome.identity.launchWebAuthFlow()` |
| `alarms` | Auto-lock timer |

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
