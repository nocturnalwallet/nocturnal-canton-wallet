# Pattern A Implementation Checklist

## CIP-0103 `prepareExecute` via Wallet Gateway

### Context

The current architecture routes all wallet operations through dapp-core, which uses wallet-sdk server-side to talk directly to Canton Ledger API. This creates a **split-brain problem** — dapp-core and Wallet Gateway maintain separate state, preventing standard CIP-0103 dApps from working with our infrastructure.

**Goal**: Adopt Pattern A where ginkgo connects directly to the Wallet Gateway for all wallet operations via CIP-0103 `prepareExecute`, while dapp-core is minimized to Google OAuth + user-party mapping only. A signing relay bridges the Gateway's signing requests to extension-held keys.

### Architecture

```text
canton-exchange-frontend (dApp)
    |
    |-- CIP-0103 postMessage --> ginkgo extension
    |                                |
    |                                |-- Wallet Gateway (dApp API)
    |                                |       |
    |                                |       |-- Canton Ledger API (prepare/execute)
    |                                |       |
    |                                |       '-- Signing Relay <--Socket.io--> extension
    |                                |
    |                                '-- local signing (private key in memory)
    |
    '-- REST API --> dapp-core (auth only)
                        '-- Google OAuth + JWT + user-party mapping
```

---

## Phase 1: Foundation (no behavioral changes)

### 1.1 Network Config

- [x] Add `gatewayUrl` and `signingRelayUrl` to `NetworkConfig` interface in `ginkgo/lib/network.ts`
- [x] Add localnet values: `gatewayUrl: 'http://localhost:5210'`, `signingRelayUrl: 'http://localhost:4100'`
- [x] Add empty strings for devnet/testnet/mainnet (graceful degradation)

```typescript
export interface NetworkConfig {
  id: NetworkId;
  label: string;
  apiBaseUrl: string;        // existing dapp-core URL
  gatewayUrl: string;        // NEW: Wallet Gateway URL
  signingRelayUrl: string;   // NEW: Signing relay Socket.io URL
  explorerUrl: string;
  faucetEnabled: boolean;
}
```

### 1.2 Gateway Client

- [x] Create `ginkgo/entrypoints/background/gateway-client.ts`
- [x] Implement `setGatewayBaseUrl(url)` to configure base URL
- [x] Implement `gatewayDappRpc(method, params)` — calls `/api/v0/dapp` (JSON-RPC 2.0)
- [x] Implement `gatewayUserRpc(method, params)` — calls `/api/v0/user` (JSON-RPC 2.0)
- [x] Add request interceptor using `sessionStore.authToken` for Bearer auth

### 1.3 Gateway Types

- [x] Create `ginkgo/lib/dapp-api/gateway-types.ts`
- [x] Define `PrepareExecuteParams` interface (commands, actAs, readAs, disclosedContracts, synchronizerId, commandId, packageIdSelectionPreference)
- [x] Define `LedgerApiParams` interface (requestMethod, resource, body)
- [x] Define `GatewayTransaction` interface (commandId, status, preparedTransaction, preparedTransactionHash, payload, origin)

### Phase 1 Verification

**Build check:**

```bash
cd ginkgo && yarn install && yarn build
```

- [x] `yarn build` completes with no TypeScript errors
- [ ] No behavioral changes — load extension in Chrome, verify existing features (unlock, lock, balance, transfer) still work as before

---

## Phase 2: Signing Relay Service

### 2.1 Project Scaffold

- [x] Create directory `ginkgo/tools/signing-relay/`
- [x] Create `package.json` with Express, Socket.io, TypeScript dependencies
- [x] Create `tsconfig.json`
- [x] Create `src/types.ts` with shared types matching `signing-lib/src/rpc-gen/typings.ts`

### 2.2 HTTP API (Blockdaemon-compatible)

Reference: `splice-wallet-kernel/core/signing-blockdaemon/src/signing-api-sdk.ts`

- [x] Create `src/http-api.ts`
- [x] Implement `POST /signTransaction` — receives `{ tx, txHash, keyIdentifier, internalTxId?, masterKey, testNetwork }`, forwards to connected extension via Socket.io, returns `{ txId, status, signature?, publicKey? }`
- [x] Implement `POST /getTransaction` — returns signing status for a given `txId`
- [x] Implement `POST /getTransactions` — returns signing statuses for multiple `txIds`/`publicKeys`
- [x] Implement `POST /getKeys` — returns all registered keys from connected extensions: `{ keys: [{ id, name, publicKey }] }`
- [x] Implement `POST /createKey` — stores a key mapping, returns created key
- [x] Add 60s timeout for `signTransaction` — return `{ status: 'failed' }` if extension doesn't respond

### 2.3 Socket.io Handler

- [x] Create `src/socket-handler.ts`
- [x] Handle connection auth: `{ partyId: string, token?: string }`
- [x] Handle `register-keys` event: extension sends `{ keys: [{ id, name, publicKey }] }`, store in `Map<publicKey, Socket>`
- [x] Emit `sign-request` to extension: `{ txId, tx, txHash, keyIdentifier, internalTxId? }`
- [x] Handle `sign-response` from extension: `{ txId, signature, publicKey, status }`, resolve pending HTTP request
- [x] Handle disconnect: clean up `connections` map

### 2.4 Server Entry Point

- [x] Create `src/index.ts` — Express + Socket.io server on configurable port (default 4100)
- [x] Wire HTTP routes and Socket.io handlers
- [x] Add health check endpoint `GET /health`

### 2.5 In-Memory State

- [x] `connections: Map<publicKey, Socket>` — maps public keys to connected extensions
- [x] `pendingRequests: Map<txId, { resolve, reject, timeout }>` — pending signing requests

### 2.6 Docker

- [x] Create `Dockerfile`

### Phase 2 Verification

You can use either **curl** (CLI) or **Postman** (GUI). Both approaches are documented below.

#### Option A: Postman

Postman v10+ has native Socket.io and HTTP support, making it the easiest way to test the full flow visually.

**Step 1 — Start the relay:**

```bash
cd ginkgo/tools/signing-relay
yarn install
yarn dev   # uses tsx watch — no build step needed
```

- [ ] Relay starts on port 4100

**Step 2 — HTTP: Health check and empty keys**

Create two HTTP requests in Postman:

| Request | Method | URL | Body |
|---------|--------|-----|------|
| Health | `GET` | `http://localhost:4100/health` | — |
| Get Keys | `POST` | `http://localhost:4100/getKeys` | `{}` (JSON) |

- [ ] `GET /health` returns `{ "status": "ok", "service": "signing-relay" }`
- [ ] `POST /getKeys` returns `{ "keys": [] }`

**Step 3 — Socket.io: Connect as extension**

1. In Postman, click **New** → **Socket.IO**
2. URL: `localhost:4100`
3. Go to **Params** tab, add:

   | Key | Value |
   |-----|-------|
   | `partyId` | `test-party::abc123` |

   > **Note**: Postman does not support Socket.io's `auth` payload (it's an SDK-only feature). The relay supports query params and `x-party-id` header as fallbacks. Either works — Params tab is simplest.

4. Go to **Settings** tab, verify **Client version** is `v4`
5. Click **Connect**

Expected relay log:

```text
[Relay] Extension connected: partyId=test-party::abc123, socketId=...
```

- [ ] Postman connects, relay logs the partyId

**Step 4 — Socket.io: Register keys**

In the connected Socket.io tab:

1. At the bottom **Message** field, set event name to: `register-keys`
2. Set message body (JSON):

   ```json
   {
     "keys": [
       { "id": "key-1", "name": "Test Key", "publicKey": "AQID" }
     ]
   }
   ```

3. Click **Send**

Expected relay log: `[Relay] Key registered: id=key-1, publicKey=AQID...`

Verify via HTTP — send the `POST /getKeys` request again:

```json
{ "keys": [{ "id": "key-1", "name": "Test Key", "publicKey": "AQID" }] }
```

- [ ] Keys registered and visible via `POST /getKeys`

**Step 5 — Socket.io: Listen for sign requests**

In the Socket.io tab:

1. Go to the **Events** tab (or "Listeners")
2. Add a listener for event: `sign-request`
3. Toggle it **On**

- [ ] Listener added for `sign-request`

**Step 6 — HTTP: Trigger signing**

Create a new HTTP request in Postman:

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `http://localhost:4100/signTransaction` |
| Body (JSON) | see below |

```json
{
  "tx": "dHgtYnl0ZXM=",
  "txHash": "aGFzaC10by1zaWdu",
  "keyIdentifier": { "publicKey": "AQID" },
  "masterKey": "Default",
  "testNetwork": true
}
```

Click **Send** — the request will hang (waiting for signature).

Switch to the Socket.io tab — you should see a `sign-request` event arrive:

```json
{
  "txId": "<uuid>",
  "tx": "dHgtYnl0ZXM=",
  "txHash": "aGFzaC10by1zaWdu",
  "keyIdentifier": { "publicKey": "AQID" }
}
```

- [ ] `sign-request` event received in Socket.io tab

**Step 7 — Socket.io: Respond with signature**

In the Socket.io tab, send a new message:

- Event name: `sign-response`
- Body (JSON) — copy the `txId` from the received `sign-request`:

  ```json
  {
    "txId": "<paste txId from sign-request>",
    "signature": "ZmFrZS1zaWduYXR1cmU=",
    "publicKey": "AQID",
    "status": "signed"
  }
  ```

Click **Send**.

Switch to the HTTP tab — the `/signTransaction` request should now return:

```json
{
  "txId": "...",
  "status": "signed",
  "signature": "ZmFrZS1zaWduYXR1cmU=",
  "publicKey": "AQID"
}
```

- [ ] Full signing round-trip works: HTTP request → Socket.io → HTTP response

**Step 8 — Timeout test (optional):**

1. Disconnect the Socket.io client (click **Disconnect** in Postman)
2. Send another `POST /signTransaction`
3. Wait 60s (or temporarily set `SIGN_TIMEOUT_MS = 5000` in `src/socket-handler.ts`)

Expected: `{ "txId": "...", "status": "failed" }`

- [ ] Timeout returns `status: "failed"` when no client is connected

#### Option B: curl + test script

**Step 1 — Start the relay:**

```bash
cd ginkgo/tools/signing-relay
yarn install
yarn dev
```

- [ ] Relay starts on port 4100

**Step 2 — Health check and empty keys (new terminal):**

```bash
curl http://localhost:4100/health
# Expected: { "status": "ok", "service": "signing-relay" }

curl -s -X POST http://localhost:4100/getKeys \
  -H "Content-Type: application/json" -d '{}'
# Expected: { "keys": [] }
```

- [ ] `GET /health` returns `{ "status": "ok" }`
- [ ] `POST /getKeys` returns `{ "keys": [] }`

**Step 3 — Run test Socket.io client:**

Save as `ginkgo/tools/signing-relay/test-client.mjs`:

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:4100", {
  transports: ["websocket"],
  auth: { partyId: "test-party::abc123" },
});

socket.on("connect", () => {
  console.log("Connected:", socket.id);
  socket.emit("register-keys", {
    keys: [{ id: "key-1", name: "Test Key", publicKey: "AQID" }],
  });
  console.log("Registered keys");
});

socket.on("sign-request", (data) => {
  console.log("Sign request received:", JSON.stringify(data, null, 2));
  socket.emit("sign-response", {
    txId: data.txId,
    signature: "ZmFrZS1zaWduYXR1cmU=",
    publicKey: "AQID",
    status: "signed",
  });
  console.log("Sent sign-response");
});
```

```bash
cd ginkgo/tools/signing-relay
yarn add socket.io-client   # temp dev dependency
yarn tsx test-client.mjs
```

- [ ] Test client connects and registers keys

**Step 4 — Verify key registration (new terminal):**

```bash
curl -s -X POST http://localhost:4100/getKeys \
  -H "Content-Type: application/json" -d '{}'
# Expected: { "keys": [{ "id": "key-1", "name": "Test Key", "publicKey": "AQID" }] }
```

- [ ] `POST /getKeys` returns the registered key

**Step 5 — Test signing round-trip:**

```bash
curl -s -X POST http://localhost:4100/signTransaction \
  -H "Content-Type: application/json" \
  -d '{
    "tx": "dHgtYnl0ZXM=",
    "txHash": "aGFzaC10by1zaWdu",
    "keyIdentifier": { "publicKey": "AQID" },
    "masterKey": "Default",
    "testNetwork": true
  }'
```

Expected: test client logs `Sign request received` + `Sent sign-response`, curl returns:

```json
{ "txId": "...", "status": "signed", "signature": "ZmFrZS1zaWduYXR1cmU=", "publicKey": "AQID" }
```

- [ ] `POST /signTransaction` returns `status: "signed"` with signature

**Step 6 — Timeout test (optional):**

Stop the test client (Ctrl+C), then send another `/signTransaction`:

```bash
curl -s -X POST http://localhost:4100/signTransaction \
  -H "Content-Type: application/json" \
  -d '{
    "tx": "dHgtYnl0ZXM=",
    "txHash": "aGFzaC10by1zaWdu",
    "keyIdentifier": { "publicKey": "AQID" },
    "masterKey": "Default",
    "testNetwork": true
  }'
# Waits 60s, then returns: { "txId": "...", "status": "failed" }
```

> **Tip**: To speed this up, temporarily change `SIGN_TIMEOUT_MS` in `src/socket-handler.ts` to `5000`.

- [ ] Timeout returns `status: "failed"` when no client is connected

**Cleanup:**

```bash
yarn remove socket.io-client   # remove temp dependency
rm test-client.mjs               # remove test file
```

---

## Phase 3: Extension Relay Client

### 3.1 Dependencies

- [x] Add `socket.io-client` to `ginkgo/package.json`

### 3.2 Relay Client

- [x] Create `ginkgo/entrypoints/background/signing-relay/relay-client.ts`
- [x] Implement `SigningRelayClient` class:
  - [x] `connect(relayUrl, partyId, authToken?)` — Socket.io connect with auth, websocket transport, reconnection
  - [x] `registerKeys(keys)` — emit `register-keys` with `[{ id: fingerprint, name: hint, publicKey }]`
  - [x] `handleSignRequest(request)` — on `sign-request`: show approval popup, sign with `getCachedPrivateKey()` + `signTransactionHash()`, emit `sign-response`
  - [x] `disconnect()` — clean disconnect
  - [x] `isConnected` getter
- [x] Export singleton `signingRelay`

### 3.3 Session Integration

- [x] Modify `ginkgo/entrypoints/background/handlers/session.handler.ts`:
  - [x] In `handleUnlock()`: after `unlocked = true`, connect signing relay with partyId and registered keys
  - [x] In `handleLock()`: disconnect signing relay
- [x] Modify `ginkgo/entrypoints/background.ts`:
  - [x] Import and call `setGatewayBaseUrl()` during network init

### 3.4 MV3 Service Worker Keepalive

- [x] Add `chrome.alarms` keepalive when relay is connected (service workers go idle)
- [x] Clear keepalive alarm on disconnect

### Phase 3 Verification

**Prerequisites**: Phase 2 signing relay running on port 4100, wallet already set up with a party.

**Step 1 — Build the extension:**

```bash
cd ginkgo && yarn install && yarn build
```

- [ ] `yarn build` completes with no errors

**Step 2 — Load extension in Chrome:**

1. Open `chrome://extensions/`, enable Developer mode
2. Click "Load unpacked", select `ginkgo/build/` (or `.output/chrome-mv3`)
3. Open the extension's service worker console: on the extension card, click "Inspect views: service worker"

- [ ] Extension loads without errors

**Step 3 — Verify relay connect on unlock:**

1. Open the extension popup, enter password to unlock
2. Watch the service worker console

Expected logs:

```text
[SigningRelay] Connecting to http://localhost:4100 for party <partyId>...
[SigningRelay] Connected
[SigningRelay] Keys registered
```

The signing relay terminal should show:

```text
[Socket.io] Extension connected: <socketId> (party: <partyId>)
[Socket.io] Keys registered from <socketId>: key-1 (...)
```

- [ ] Service worker logs "Connected" to signing relay
- [ ] Relay server logs the incoming connection

**Step 4 — Verify relay disconnect on lock:**

1. Lock the wallet (extension popup → lock icon)
2. Watch the service worker console

Expected: `[SigningRelay] Disconnected`

- [ ] Service worker logs "Disconnected"

**Step 5 — Verify reconnection:**

1. Stop the signing relay (Ctrl+C in relay terminal)
2. Unlock the wallet (if locked) — service worker will log connection errors/retries
3. Restart the relay: `cd ginkgo/tools/signing-relay && yarn dev`
4. Wait a few seconds for automatic reconnection

Expected: service worker logs `[SigningRelay] Connected` again after relay restarts.

- [ ] Extension auto-reconnects when relay comes back up

**Step 6 — Verify keepalive alarm:**

In the service worker console, run:

```javascript
chrome.alarms.getAll(alarms => console.log(alarms));
```

While relay is connected, there should be a `signing-relay-keepalive` alarm. After locking/disconnecting, it should be gone.

- [ ] Keepalive alarm exists while connected, cleared on disconnect

---

## Phase 4: CIP-0103 Methods

### 4.1 `prepareExecute`

File: `ginkgo/entrypoints/background/handlers/dapp-api.handler.ts`

- [x] Replace `notImplemented('prepareExecute')` with `handlePrepareExecute`:
  1. Verify wallet unlocked + has partyId
  2. Forward to Gateway: `gatewayDappRpc('prepareExecute', params)` → receives `{ userUrl }`
  3. Extract `commandId` from `userUrl`
  4. Show approval popup via `requestApproval()` with transaction details
  5. If rejected: `gatewayUserRpc('deleteTransaction', { commandId })`, throw error
  6. If approved: sign `preparedTransactionHash` locally using `getCachedPrivateKey()`
  7. Call `gatewayUserRpc('execute', { commandId, signature, signedBy: fingerprint })`
  8. Return result to dApp

**Design note**: Extension signs locally (not via relay round-trip) since private key is in memory. Relay is for Gateway-initiated signing.

### 4.2 `prepareExecuteAndWait`

- [x] Replace `notImplemented('prepareExecuteAndWait')` with `handlePrepareExecuteAndWait`:
  - Same as `prepareExecute` but captures and returns the full execution result
  - Returns `{ tx: { status: 'executed', commandId, payload: executeResult } }`

### 4.3 `ledgerApi`

- [x] Replace `notImplemented('ledgerApi')` with `handleLedgerApi`:
  - Verify wallet unlocked
  - Proxy to Gateway: `gatewayDappRpc('ledgerApi', { requestMethod, resource, body })`
  - Return raw response

### 4.4 Approval Handling

- [x] Do NOT add `prepareExecute`/`prepareExecuteAndWait` to `APPROVAL_REQUIRED_METHODS` (approval is managed internally after getting tx details from Gateway — avoids double-popup)

### 4.5 Approval UI

- [x] Modify `ginkgo/entrypoints/popup/pages/approval/DappApproval.tsx`:
  - Add `prepareExecute` → "Execute Transaction" in `METHOD_LABELS`
  - Add `prepareExecuteAndWait` → "Execute Transaction"
  - Add "Sign for Gateway" label for relay-initiated signing

### Phase 4 Verification

**Prerequisites**: Canton node running, Wallet Gateway running on port 5210, signing relay on port 4100, extension built and loaded, wallet unlocked with a valid party.

**Step 1 — Create a test HTML page:**

Save as `ginkgo/tools/test-cip0103.html`:

```html
<!DOCTYPE html>
<html>
<head><title>CIP-0103 Test</title></head>
<body>
  <h1>CIP-0103 Test Page</h1>
  <button id="btn-ledger">Test ledgerApi</button>
  <button id="btn-prepare">Test prepareExecute</button>
  <pre id="output"></pre>

  <script>
    const log = (msg) => {
      document.getElementById('output').textContent += msg + '\n';
      console.log(msg);
    };

    // Listen for responses from extension
    window.addEventListener('message', (event) => {
      if (event.data?.source === 'splice-wallet') {
        log('Response: ' + JSON.stringify(event.data, null, 2));
      }
    });

    // Test ledgerApi — queries active contracts (read-only, no signing)
    document.getElementById('btn-ledger').onclick = () => {
      log('Sending ledgerApi request...');
      window.postMessage({
        source: 'splice-dapp',
        method: 'ledgerApi',
        params: {
          requestMethod: 'GET',
          resource: '/v2/state/active-contracts',
          body: null,
        },
      }, '*');
    };

    // Test prepareExecute — replace with a real Daml command for your dApp
    document.getElementById('btn-prepare').onclick = () => {
      log('Sending prepareExecute request...');
      window.postMessage({
        source: 'splice-dapp',
        method: 'prepareExecute',
        params: {
          commands: [
            // Replace with actual Daml command, e.g.:
            // {
            //   commandType: 'exercise',
            //   templateId: 'Module:Template',
            //   contractId: '<contract-id>',
            //   choiceName: 'MyChoice',
            //   choiceArgument: { field: 'value' },
            // }
          ],
          actAs: ['<your-party-id>'],
          readAs: [],
        },
      }, '*');
    };
  </script>
</body>
</html>
```

Open in Chrome: `file:///path/to/ginkgo/tools/test-cip0103.html`

**Step 2 — Test `ledgerApi` (read-only):**

1. Click "Test ledgerApi"
2. The extension should proxy the request to the Gateway without showing an approval popup

- [ ] `ledgerApi` returns data from the Ledger API (or a meaningful error if no contracts exist)

**Step 3 — Test `prepareExecute`:**

1. Update the `commands` array in the test page with a valid Daml command for your deployment
2. Click "Test prepareExecute"
3. The extension should show an approval popup labeled "Execute Transaction"

- [ ] Approval popup appears with method label "Execute Transaction"

**Step 4 — Approve:**

1. Click "Approve" in the popup
2. The extension signs locally, sends to Gateway, Gateway executes on Canton

Expected response in the test page:

```json
{
  "source": "splice-wallet",
  "method": "prepareExecute",
  "result": { ... }
}
```

- [ ] Transaction executes successfully (verify on Canton explorer at `VITE_EXPLORER_LINK`)

**Step 5 — Reject:**

1. Click "Test prepareExecute" again
2. Click "Reject" in the popup

Expected: test page receives an error response, extension calls `deleteTransaction` on Gateway.

- [ ] Rejection returns error to dApp, transaction cleaned up on Gateway

**Troubleshooting:**

- If no popup appears, check the service worker console for errors
- If Gateway returns 401, verify the extension has a valid auth token (check `sessionStore.authToken`)
- If signing fails, verify the party's fingerprint matches the signing key (see MEMORY.md — fingerprint mismatch section)

---

## Phase 5: dapp-core Minimization

### 5.1 New Endpoint

- [x] Add `POST /auth/register-party` to `dapp-core/src/modules/auth/auth.controller.ts`:
  - Authenticated (JWT required)
  - Body: `{ partyId: string }`
  - Updates `Party` entity for authenticated user with partyId + `onboardingStatus: 'SUCCESSFULLY'`
  - Response: `{ code: 200, data: { partyId, onboardingStatus: 'SUCCESSFULLY' } }`

### 5.2 Remove Wallet Modules

- [ ] Delete `src/modules/onboarding/` (service + controller)
- [ ] Delete `src/modules/transfer/` (service + controller)
- [ ] Delete `src/modules/amulet-transfer/` (service + controller)
- [ ] Delete `src/modules/balance/` (service + controller)
- [ ] Delete `src/modules/transfer-preapproval/` (service + controller)
- [ ] Delete `src/entities/transfer-history.entity.ts`
- [ ] Delete `gateway-config.json`

**Keep** `src/modules/gateway/` (wallet-sdk.ts, gateway.service.ts) and `src/modules/faucet/` — dapp-core acts as middleware for operations requiring admin/validator access (SDK, scan proxy). See Phase 8.3.

### 5.3 Trim Entry Point

- [x] Modify `dapp-core/src/index.ts`:
  - Remove all route registrations except auth routes
  - Remove `initWalletSDK()` call
  - Remove unused imports

### 5.4 Trim Config

- [x] Modify `dapp-core/src/config/index.ts`:
  - Remove: `participantLedgerApiUrl`, `walletGatewayUrl`, `canton.adminUser`, `canton.adminPassword`
  - Keep: database config, auth config (JWT secret, Google OAuth), server port

### 5.5 Clean Dependencies

- [ ] **Keep** `@canton-network/wallet-sdk` — needed by faucet middleware (Phase 8.3)
- [ ] Remove any other unused dependencies
- [ ] Run `yarn install` to update lockfile

### 5.6 Database Migration

- [ ] Create TypeORM migration to drop `transfer_history` table
- [x] Remove `TransferHistory` from database entity registration in `src/config/database.ts`

### Phase 5 Verification

**Prerequisites**: PostgreSQL running, dapp-core database exists.

**Step 1 — Build and start dapp-core:**

```bash
cd Quickstart/dapp-core
npm install
npm run build   # tsc
npm run dev     # or: npm start
```

- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] Server starts on configured port (default 3003)

**Step 2 — Test auth flow:**

```bash
# Sign in (use an existing user or sign up first via Google OAuth in the frontend)
# After sign-in, you'll have a JWT token. For testing, grab it from localStorage in the frontend:
# localStorage.getItem('token')

TOKEN="<your-jwt-token>"

# Test /auth/me
curl -s http://localhost:3003/auth/me \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: { "code": 200, "data": { "id": ..., "email": ..., "party": { ... } } }
```

- [ ] `GET /auth/me` returns user + party data

**Step 3 — Test register-party:**

```bash
curl -s -X POST http://localhost:3003/auth/register-party \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "partyId": "test-hint::1220abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678" }' | jq .
# Expected: { "code": 200, "data": { "partyId": "test-hint::1220...", "onboardingStatus": "SUCCESSFULLY" } }
```

- [ ] `POST /auth/register-party` creates/updates party for the user

**Step 4 — Test token refresh:**

```bash
REFRESH_TOKEN="<your-refresh-token>"

curl -s -X POST http://localhost:3003/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d "{ \"refreshToken\": \"$REFRESH_TOKEN\" }" | jq .
# Expected: { "code": 200, "data": { "token": "...", "refreshToken": "..." } }
```

- [ ] `POST /auth/refresh-token` returns new tokens

**Step 5 — Verify removed endpoints return 404:**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3003/balance
# Expected: 404

curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3003/faucet/tap
# Expected: 404

curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3003/transfer
# Expected: 404
```

- [ ] Removed endpoints (balance, faucet, transfer, onboarding) return 404

**Step 6 — Database migration (if applicable):**

```bash
# If transfer_history table exists from previous deployment:
npm run migration:run   # or manually: DROP TABLE IF EXISTS transfer_history;
```

- [ ] Database migration runs cleanly (or not needed if fresh DB)

---

## Phase 6: Gateway Configuration + End-to-End

### 6.1 Gateway Signing Provider

- [x] Configure Wallet Gateway with Blockdaemon signing provider:

  ```env
  SIGNING_PROVIDER=BLOCKDAEMON
  BLOCKDAEMON_API_URL=http://localhost:4100
  ```

### 6.2 Party Mode

- [x] Set Gateway to external party mode:

  ```env
  PARTY_MODE=external
  ```

### 6.3 End-to-End Test

**Step 1 — Start all services (4 terminals):**

```bash
# Terminal 1: Canton node (via Docker Compose or Makefile)
cd Quickstart && make start
# Wait for Canton to be ready (health check passes)

# Terminal 2: Wallet Gateway (configured with Blockdaemon signing)
# Ensure gateway-config.json has signing.provider=BLOCKDAEMON, signing.blockdaemon.apiUrl=http://localhost:4100
cd Quickstart && make start-gateway
# Or: docker-compose up wallet-gateway

# Terminal 3: Signing relay
cd ginkgo/tools/signing-relay && yarn dev
# Expected: Listening on port 4100

# Terminal 4: dapp-core
cd Quickstart/dapp-core && npm run dev
# Expected: Listening on port 3003
```

- [ ] All 4 services running: Canton, Gateway (port 5210), relay (port 4100), dapp-core (port 3003)

**Step 2 — Sign up and authenticate:**

1. Open `canton-exchange-frontend` in Chrome (`npm run dev` → `http://localhost:5173`)
2. Click "Sign in with Google" → complete OAuth flow
3. dapp-core creates user, returns JWT

- [ ] User signed in, JWT stored in localStorage

**Step 3 — Extension onboarding:**

1. Open the ginkgo extension popup
2. Create or import a wallet (generates key pair)
3. The extension calls Gateway to create an external party using the generated public key
4. Gateway creates the party on Canton Ledger API
5. Extension registers the partyId with dapp-core via `POST /auth/register-party`

Verify in the extension's service worker console:

```text
[Onboarding] Party created: <hint>::<fingerprint>
[Onboarding] Registered party with dapp-core
```

- [ ] External party created on Canton
- [ ] partyId registered with dapp-core (`GET /auth/me` shows party)

**Step 4 — Verify signing relay connection:**

After onboarding + unlock, check:

- Service worker console: `[SigningRelay] Connected` + `Keys registered`
- Relay terminal: `Extension connected` + `Keys registered`

```bash
# Verify key is registered on relay
curl -s -X POST http://localhost:4100/getKeys \
  -H "Content-Type: application/json" -d '{}' | jq .
# Should show the extension's public key
```

- [ ] Extension connected to signing relay, keys registered

**Step 5 — Execute a dApp transaction (CIP-0103):**

1. In canton-exchange-frontend, perform an action that uses `prepareExecuteAndWait` (e.g., a swap or transfer)
2. The frontend sends a CIP-0103 `postMessage` to the extension
3. Extension forwards to Gateway → Gateway prepares on Canton
4. Extension shows approval popup ("Execute Transaction")
5. Click "Approve"
6. Extension signs the `preparedTransactionHash` locally
7. Extension sends signature to Gateway → Gateway executes on Canton
8. Result returned to frontend

- [ ] Approval popup appears with transaction details
- [ ] After approval, transaction executes successfully
- [ ] Frontend receives the result and updates UI

**Step 6 — Verify on Canton explorer:**

Open the Canton explorer (`VITE_EXPLORER_LINK`) and confirm the transaction appears with the correct party as the submitter.

- [ ] Transaction visible on explorer with correct party

**Step 7 — Test relay-initiated signing:**

This tests the reverse path: Gateway independently calls the relay to get a signature (e.g., for automated operations).

```bash
# Find the extension's public key
PUB_KEY=$(curl -s -X POST http://localhost:4100/getKeys \
  -H "Content-Type: application/json" -d '{}' | jq -r '.keys[0].publicKey')

# Simulate a Gateway sign request
curl -s -X POST http://localhost:4100/signTransaction \
  -H "Content-Type: application/json" \
  -d "{
    \"tx\": \"dHgtYnl0ZXM=\",
    \"txHash\": \"dGVzdC1oYXNo\",
    \"keyIdentifier\": { \"publicKey\": \"$PUB_KEY\" },
    \"masterKey\": \"Default\",
    \"testNetwork\": true
  }"
```

Expected: Extension shows approval popup ("Sign for Gateway"), after approval returns `{ status: "signed", signature: "..." }`.

- [ ] Relay-initiated signing triggers extension approval popup
- [ ] After approval, relay returns signed response

**Step 8 — Test graceful degradation (relay down):**

1. Stop the signing relay (Ctrl+C)
2. Perform a `prepareExecute` action from the frontend
3. The extension should still work — it signs locally without the relay
4. The relay is only needed for Gateway-initiated signing, not for dApp-initiated `prepareExecute`

- [ ] `prepareExecute` still works when relay is down (local signing path)

**Step 9 — Test lock/unlock cycle:**

1. Lock the wallet via extension popup
2. Verify relay terminal shows disconnect
3. Unlock the wallet
4. Verify relay terminal shows reconnection + key re-registration

```bash
# After unlock, verify keys re-registered
curl -s -X POST http://localhost:4100/getKeys \
  -H "Content-Type: application/json" -d '{}' | jq .
```

- [ ] Lock disconnects from relay
- [ ] Unlock reconnects and re-registers keys

**Step 10 — Test network switch (if applicable):**

1. Switch network in extension (e.g., localnet → devnet)
2. Verify relay disconnects (devnet has no relay URL configured)
3. Switch back to localnet
4. Verify relay reconnects

- [ ] Network switch triggers relay disconnect/reconnect as appropriate

---

## Phase 7: Party Onboarding via Wallet Gateway

After Phase 5 (dapp-core minimization), the onboarding endpoints (`/external-party/onboarding/*`, `/transfer-preapproval/*`) were removed from dapp-core. The extension's `handleCompleteOnboarding` now fails with 404. These must be replaced with the Wallet Gateway's `createWallet` JSON-RPC method, which internally handles topology generation, signing (via the signing relay), and party allocation.

### New Onboarding Flow

```text
Extension                    Relay                   Gateway
   |                          |                        |
   |-- connect(url, '', token) -->                     |
   |-- registerKeys([key]) --->                        |
   |                          |                        |
   |--- gatewayUserRpc('createWallet', {...}) -------->|
   |                          |                        |
   |                          |<-- POST /createKey ----|
   |                          |--- return key -------->|
   |                          |                        |
   |                          |<-- POST /signTx -------|
   |<-- sign-request ---------|                        |
   |--- sign-response ------->|                        |
   |                          |--- return sig -------->|
   |                          |                        |
   |<--- { wallet: { partyId, status: 'allocated' } } -|
   |                          |                        |
   |--- POST /auth/register-party ---> dapp-core       |
```

### 7.1 Relay Security: Shared API Key

Currently the relay has zero authentication — all HTTP endpoints are open, Socket.io tokens are ignored, CORS defaults to `*`. This is dangerous especially during onboarding where we auto-approve sign requests.

**Files**: `ginkgo/tools/signing-relay/src/index.ts`, `http-api.ts`, `socket-handler.ts`

- [ ] Add `RELAY_API_KEY` env var to signing relay
- [ ] Add Express middleware on HTTP routes: validate `Authorization: Bearer <RELAY_API_KEY>` header
- [ ] Add Socket.io auth middleware: validate `token` field matches `RELAY_API_KEY`
- [ ] Restrict CORS origins to configured values only (no more `*` default)
- [ ] Pass `RELAY_API_KEY` from extension via Socket.io auth

### 7.2 Signing Relay: `POST /createKey` fallback

**File**: `ginkgo/tools/signing-relay/src/http-api.ts`

- [ ] When no key matches by `name`, return the **first registered key** instead of an empty placeholder
- [ ] Log fallback usage for debugging

### 7.3 Relay Client: add `autoApprove` flag

**File**: `ginkgo/entrypoints/background/signing-relay/relay-client.ts`

- [ ] Add `setAutoApprove(enabled: boolean)` method to `SigningRelayClient`
- [ ] In `handleSignRequest()`: skip approval popup and auto-sign when `autoApprove` is true
- [ ] Log when auto-approving for debugging

### 7.4 Session Handler: export relay-connect for onboarding

**File**: `ginkgo/entrypoints/background/handlers/session.handler.ts`

- [ ] Export `connectSigningRelay()` (make public)
- [ ] Add `connectSigningRelayForOnboarding(privateKey: string)` — connects to relay without partyId, registers key with generic name `'onboarding'`

### 7.5 Gateway Types: `CreateWalletParams` / `CreateWalletResult`

**File**: `ginkgo/lib/dapp-api/gateway-types.ts`

- [ ] Add `CreateWalletParams` interface: `{ partyHint: string; signingProviderId: string; primary?: boolean }`
- [ ] Add `CreateWalletResult` interface: `{ wallet: { partyId: string; status: string; hint: string; publicKey: string; ... } }`

### 7.6 Keystore Handler: replace dapp-core calls with Gateway (CORE)

**File**: `ginkgo/entrypoints/background/handlers/keystore.handler.ts`

- [ ] Rewrite `handleCompleteOnboarding()`:
  1. Encrypt + store key in IndexedDB
  2. Cache private key in memory (needed for relay signing)
  3. Connect to relay + register key (via `connectSigningRelayForOnboarding()`)
  4. Enable `autoApprove` on relay client
  5. Call `gatewayUserRpc('createWallet', { partyHint, signingProviderId: 'blockdaemon', primary: true })`
  6. Store partyId from response
  7. Call dapp-core `POST /auth/register-party` to link partyId to user
  8. Reconnect relay with real partyId (via `connectSigningRelay()`)
  9. Disable `autoApprove`
  10. Set `onboardingComplete = true`, `unlocked = true`
- [ ] Stub `handlePrepareOnboarding()` — return empty data (no longer needed)
- [ ] Update `handleRegisterTransferPreapproval()` — return error (deferred to future phase)

### 7.7 Popup: remove pre-fetch

**File**: `ginkgo/entrypoints/popup/App.tsx`

- [ ] Remove the fire-and-forget `PREPARE_ONBOARDING` call in the `create-password` handler
- [ ] Keep `preparedParty` field in `OnboardingState` (ignored but harmless)

### Phase 7 Verification

**Prerequisites**: Signing relay (port 4100), Wallet Gateway (port 5210, `SIGNING_PROVIDER=BLOCKDAEMON`, `BLOCKDAEMON_API_URL=http://localhost:4100`, `BLOCKDAEMON_API_KEY=<RELAY_API_KEY>`), dapp-core (port 3003).

**Step 1 — Build the extension:**

```bash
cd ginkgo && yarn install && yarn build
```

- [ ] `yarn build` completes with no TypeScript errors

**Step 2 — End-to-end onboarding:**

1. Load extension in Chrome, sign in with Google
2. Create a new key, complete onboarding

Expected console logs:

```text
[Ginkgo Relay] Connected to signing relay
[Ginkgo] Calling createWallet with partyHint: <username>
[Relay HTTP] /createKey: no match for name=..., returning first registered key
[Ginkgo Relay] Auto-approved sign request (onboarding mode)
[Ginkgo] createWallet result: <partyId> allocated
[Ginkgo] Registered party with dapp-core backend
```

- [ ] partyId allocated and stored
- [ ] `GET /auth/me` returns party with `onboardingStatus: SUCCESSFULLY`

**Step 3 — Verify relay reconnect:**

- [ ] Lock → unlock → verify relay reconnects with real partyId

**Step 4 — Verify relay auth:**

```bash
# Should return 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4100/getKeys \
  -H "Content-Type: application/json" -d '{}'

# Should return 200 with key
curl -s -X POST http://localhost:4100/getKeys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <RELAY_API_KEY>" -d '{}'
```

- [ ] Unauthenticated HTTP requests return 401

### Transfer Preapproval (moved to Phase 8.8)

Transfer preapproval registration was removed from dapp-core. Stubbed with error response in Phase 7. Full implementation via Gateway `ledgerApi` interactive submission is planned in **Section 8.8**.

---

## Phase 8: Replace Deleted dapp-core Modules

Phase 5 removed all wallet modules from dapp-core (balance, transfer, faucet, onboarding, offers, activity). Only auth routes remain. The extension's `api.handler.ts` and `signing.handler.ts` still call these deleted endpoints, causing 404 errors. Each deleted module needs a Gateway-based substitute using `ledgerApi` (ACS queries) for reads and `prepareExecute` for writes.

### 8.1 Token Balance via Gateway `ledgerApi`

**Goal**: Replace `GET /wallet/token-balance?partyId=...` with Gateway ACS query.

**File**: `ginkgo/entrypoints/background/handlers/api.handler.ts`

- [ ] Rewrite `handleFetchBalances()`:
  1. Get ledger offset: `gatewayDappRpc('ledgerApi', { requestMethod: 'GET', resource: '/v2/state/ledger-end' })`
  2. Query ACS: `gatewayDappRpc('ledgerApi', { requestMethod: 'POST', resource: '/v2/state/active-contracts', body })` with `InterfaceFilter` for `HOLDING_INTERFACE_ID`
  3. Parse `createdEvent.interfaceViews[0].viewValue` → `{ instrumentId: { admin, id }, amount, lock }`
  4. Aggregate by `instrumentId`: sum `locked` (has lock) vs `unlocked` (no lock), collect `lockedDetails`
  5. Return `{ balances: BalanceSwapResponse[] }`

**Key constant**: `HOLDING_INTERFACE_ID = '#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding'`

### 8.2 Remove Token Prices

**Goal**: Remove `/wallet/token-prices` — not related to token standard or CIP.

- [ ] Delete `handleFetchPrices()` from `api.handler.ts`
- [ ] Remove `MSG.FETCH_PRICES` case from `background.ts` message router
- [ ] Remove `FETCH_PRICES` from `lib/messaging/constants.ts`
- [ ] Remove price-related types from `lib/messaging/types.ts`
- [ ] Remove `usePrices` hook and any price display UI components

### 8.3 Faucet via dapp-core Middleware

**Goal**: Keep faucet on dapp-core as middleware — it has admin/validator access (Wallet SDK, scan proxy) needed to discover DSO contracts (AmuletRules, OpenMiningRound). The extension only signs locally.

**Why not direct Gateway?** The DevNet Tap requires discovering AmuletRules and OpenMiningRound contracts owned by the DSO party. External party users don't have `readAs` rights on DSO contracts, so ACS queries via Gateway `ledgerApi` fail with `PERMISSION_DENIED`. The Wallet SDK (server-side) uses the scan proxy which has the necessary access.

**Architecture**: dapp-core (prepare/execute) ↔ Ginkgo (sign only)

```text
Ginkgo                              dapp-core                     Canton
  |                                    |                            |
  |-- POST /devnet-tap/prepare ------->|                            |
  |                                    |-- SDK createTap() -------->|
  |                                    |-- /v2/.../prepare -------->|
  |<-- { preparedTransactionHash } ----|                            |
  |                                    |                            |
  |-- signTransactionHash(hash, key)   |                            |
  |                                    |                            |
  |-- POST /devnet-tap/submit -------->|                            |
  |   { signature, partyId }           |-- /v2/.../execute -------->|
  |<-- { success } -------------------|                            |
```

**dapp-core changes** (`Quickstart/dapp-core`):

- [x] Add config entries: `participantLedgerApiUrl`, `validatorApiUrl`, `gatewayUserApiUrl`, `gatewayDappApiUrl`, `canton.*`
- [x] Copy `src/modules/gateway/gateway.service.ts` from cn-quickstart-dapp-core (JWT generation, JSON-RPC)
- [x] Copy `src/modules/gateway/wallet-sdk.ts` from cn-quickstart-dapp-core (SDK init, scan proxy, synchronizer ID)
- [x] Copy `src/lib/canton-api.ts` from cn-quickstart-dapp-core (Validator API HTTP client)
- [x] Copy `src/modules/faucet/faucet.controller.ts` + `faucet.service.ts` from cn-quickstart-dapp-core
- [x] Register faucet route in `src/index.ts`: `app.use('/external-party', faucetRouter)`
- [x] Add `@canton-network/wallet-sdk` to `package.json`
- [x] Initialize Wallet SDK on startup (with graceful failure)

**Ginkgo changes** (`ginkgo/entrypoints/background/handlers/api.handler.ts`):

- [x] Rewrite `handleRequestFaucet(password, amount)`:
  1. Get `partyId` from session, get cached private key (or decrypt from keystore)
  2. Call dapp-core `POST /external-party/devnet-tap/prepare` with `{ partyId, amount }`
  3. Receive `{ preparedTransactionHash }` from response
  4. Sign locally: `signTransactionHash(preparedTransactionHash, privateKey)`
  5. Call dapp-core `POST /external-party/devnet-tap/submit` with `{ preparedTransaction, signature, partyId }`
  6. Return success
- [x] Remove `AMULET_RULES_TEMPLATE_ID`, `OPEN_MINING_ROUND_TEMPLATE_ID` constants
- [x] Remove `AcsCreatedEvent`, `AcsContract` interfaces
- [x] Remove `queryAcsByTemplate()` helper

### 8.4 Transfers via Gateway `prepareExecute`

**Goal**: Replace transfer prepare/submit endpoints.

**Endpoints replaced**:

- `POST /external-party/transfer-amulet/prepare` + `/submit` (Amulet/CC)
- `POST /transfer-token-standard/prepare` + `/submit` (CBTC/USDCx)

**Files**: `api.handler.ts`, `signing.handler.ts`

- [ ] Rewrite transfer prepare handlers to use `gatewayDappRpc('prepareExecute', { commands, actAs })`
- [ ] Rewrite transfer submit handlers to sign locally + call `gatewayUserRpc('execute', ...)`

**Daml details**: Both use `WalletUserProxy_TransferFactory_Transfer` choice on the `WalletUserProxy` template. Requires:

- Transfer factory contract ID (ACS query)
- Featured app right contract ID (ACS query)
- Choice context values (utilities API)
- Input holding CIDs (ACS query for holdings)
- Disclosed contracts

### 8.5 Offers (Incoming/Outgoing/History) via Gateway `ledgerApi`

**Goal**: Replace `/transfer-token-standard/incoming-requests`, `/outgoing-requests`, `/history`.

**File**: `ginkgo/entrypoints/background/handlers/api.handler.ts`

- [ ] Rewrite `handleFetchIncomingOffers()` — query ACS for `TransferInstruction` contracts where party is receiver
- [ ] Rewrite `handleFetchOutgoingOffers()` — query ACS where party is sender
- [ ] Rewrite `handleFetchHistoryOffers()` — query `/v2/updates/flats` for completed transfer events

**Interface ID**: `#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferInstruction`

### 8.6 Approve/Reject via Gateway `prepareExecute`

**Goal**: Replace approve/reject prepare/submit endpoints.

- [ ] Rewrite `handlePrepareApprove()` + `handleSignAndSubmitApprove()` — exercise `WalletUserProxy_TransferInstruction_Accept`
- [ ] Rewrite `handlePrepareReject()` + `handleSignAndSubmitReject()` — exercise `WalletUserProxy_TransferInstruction_Reject`

Same complexity as 8.4 — requires choice context and disclosed contracts.

### 8.7 Activity/TX History via Gateway `ledgerApi`

**Goal**: Replace `GET /external-party/tx-history`.

- [ ] Rewrite `handleFetchActivity()` — query `/v2/updates/flats` for transaction events involving the party
- [ ] Parse flat transaction events into the existing `PaginatedActivityData` format

### 8.8 Transfer Preapproval via Gateway

**Goal**: Replace dapp-core `/transfer-preapproval/prepare` + `/submit` + `/status` with direct Canton Ledger API calls via the Gateway's `ledgerApi` proxy.

**Background**: A `TransferPreapproval` contract allows other parties to send tokens to the user without requiring per-transfer approval. The cn-quickstart-dapp-core reference implementation (`cn-quickstart-dapp-core/dapp-core/src/modules/transfer-preapproval/`) uses the Wallet SDK server-side to build a `CreateCommand` for the `TransferPreapprovalProposal` template, then prepares + signs + executes it via the SDK's interactive submission flow. In Pattern A, the extension replicates this by proxying the Canton Ledger API's interactive submission endpoints through the Gateway's `ledgerApi` method.

**Daml template**: `#splice-wallet:Splice.Wallet.TransferPreapproval:TransferPreapprovalProposal`

**CreateCommand arguments**: `{ provider: providerParty, receiver: partyId, expectedDso: dsoParty }`

**Files**: `ginkgo/entrypoints/background/handlers/keystore.handler.ts`, `ginkgo/lib/network.ts`

**Prerequisites**: `providerParty` (validator operator) and `dsoParty` (DSO/instrument admin) must be discoverable. Options:

- (a) Add `VITE_VALIDATOR_PARTY` and `VITE_DSO_PARTY` build-time env vars (simplest for localnet)
- (b) Add thin proxy endpoints on dapp-core that query the Validator Internal API (`/v0/validator-user`, `/v0/scan-proxy/dso-party-id`)
- (c) Query the scan proxy directly if network-accessible

**Implementation steps**:

- [ ] Configure `providerParty` and `dsoParty` discovery (choose option a/b/c above)
- [ ] Rewrite `handleRegisterTransferPreapproval()`:
  1. Get `partyId` from session, get cached private key
  2. Get splice-wallet package version: `gatewayDappRpc('ledgerApi', { requestMethod: 'GET', resource: '/v2/interactive-submission/preferred-package-version?parties=<partyId>&package-name=splice-wallet' })`
  3. Build `CreateCommand` for `TransferPreapprovalProposal` with `{ provider, receiver, expectedDso }` (include `expectedDso` for version >= 0.1.11)
  4. Prepare submission: `gatewayDappRpc('ledgerApi', { requestMethod: 'POST', resource: '/v2/interactive-submission/prepare', body: JSON.stringify({ userId, commandId, commands: [createCommand], actAs: [partyId], readAs: [], synchronizerId }) })`
  5. Sign `preparedTransactionHash` locally with `signTransactionHash()`
  6. Execute submission: `gatewayDappRpc('ledgerApi', { requestMethod: 'POST', resource: '/v2/interactive-submission/execute', body: JSON.stringify({ preparedTransaction, preparedTransactionHash, submissionId: commandId, partySignatures: { signatures: [{ party: partyId, signatures: [{ format: 'SIGNATURE_FORMAT_CONCAT', signature, signedBy: fingerprint }] }] } }) })`
- [ ] Rewrite `handleGetPreapprovalStatus()`:
  1. Query ACS for `TransferPreapproval` contracts: `gatewayDappRpc('ledgerApi', { requestMethod: 'POST', resource: '/v2/state/active-contracts', body })` with `TemplateFilter` for `#splice-wallet:Splice.Wallet.TransferPreapproval:TransferPreapproval` filtered by party
  2. Return `{ hasPreapproval: contracts.length > 0 }`
- [ ] Update `handleCompleteOnboarding()`:
  - After successful `createWallet`, call preapproval registration (non-blocking, fail silently)
  - Use `autoApprove` mode since relay is still connected during onboarding
- [ ] Extract shared `prepareSignAndExecute()` helper for reuse by 8.3, 8.4, 8.6

**Reference**: `cn-quickstart-dapp-core/dapp-core/src/modules/transfer-preapproval/transfer-preapproval.service.ts` — SDK-based implementation showing the full prepare → sign → execute flow with `createTransferPreapprovalCommand()`.

### Phase 8 Verification

1. Build: `cd ginkgo && yarn build` — no TypeScript errors
2. Load extension in Chrome, sign in, complete onboarding
3. Dashboard shows token balances (Amulet with correct locked/unlocked amounts)
4. No 404 errors for balance calls in service worker console
5. Token prices section removed from UI (no errors)
6. (P1+) Faucet tap works on devnet
7. (P1+) Transfers execute via Gateway
8. Transfer preapproval registers successfully during onboarding (check service worker logs)
9. Preapproval status banner in dashboard reflects correct state

---

## Critical Files Reference

| File | Action | Component |
|------|--------|-----------|
| `ginkgo/lib/network.ts` | Modify | Extension |
| `ginkgo/entrypoints/background/gateway-client.ts` | Create | Extension |
| `ginkgo/lib/dapp-api/gateway-types.ts` | Create | Extension |
| `ginkgo/entrypoints/background/signing-relay/relay-client.ts` | Create | Extension |
| `ginkgo/entrypoints/background/handlers/dapp-api.handler.ts` | Modify | Extension |
| `ginkgo/entrypoints/background/handlers/session.handler.ts` | Modify | Extension |
| `ginkgo/entrypoints/background.ts` | Modify | Extension |
| `ginkgo/entrypoints/popup/pages/approval/DappApproval.tsx` | Modify | Extension |
| `ginkgo/tools/signing-relay/src/index.ts` | Create | Relay |
| `ginkgo/tools/signing-relay/src/http-api.ts` | Create | Relay |
| `ginkgo/tools/signing-relay/src/socket-handler.ts` | Create | Relay |
| `ginkgo/tools/signing-relay/src/types.ts` | Create | Relay |
| `dapp-core/src/modules/auth/auth.controller.ts` | Modify | dapp-core |
| `dapp-core/src/modules/faucet/faucet.controller.ts` | Create | dapp-core (Phase 8.3) |
| `dapp-core/src/modules/faucet/faucet.service.ts` | Create | dapp-core (Phase 8.3) |
| `dapp-core/src/modules/gateway/gateway.service.ts` | Create | dapp-core (Phase 8.3) |
| `dapp-core/src/modules/gateway/wallet-sdk.ts` | Create | dapp-core (Phase 8.3) |
| `dapp-core/src/lib/canton-api.ts` | Create | dapp-core (Phase 8.3) |
| `dapp-core/src/index.ts` | Modify | dapp-core |
| `dapp-core/src/config/index.ts` | Modify | dapp-core |
| `ginkgo/entrypoints/background/handlers/keystore.handler.ts` | Modify | Extension (Phase 7) |
| `ginkgo/entrypoints/popup/App.tsx` | Modify | Extension (Phase 7) |
| `ginkgo/entrypoints/background/handlers/api.handler.ts` | Modify | Extension (Phase 8) |
| `ginkgo/entrypoints/background/handlers/signing.handler.ts` | Modify | Extension (Phase 8) |
| `ginkgo/lib/messaging/constants.ts` | Modify | Extension (Phase 8) |
| `ginkgo/lib/messaging/types.ts` | Modify | Extension (Phase 8) |

### Reference Files (read-only)

| File | Purpose |
|------|---------|
| `splice-wallet-kernel/core/signing-blockdaemon/src/signing-api-sdk.ts` | Blockdaemon HTTP API contract |
| `splice-wallet-kernel/core/signing-lib/src/rpc-gen/typings.ts` | Signing types (Transaction, Key, SignTransactionParams, etc.) |
| `splice-wallet-kernel/wallet-gateway/remote/src/dapp-api/controller.ts` | Gateway prepareExecute flow reference |
| `splice-wallet-kernel/wallet-gateway/remote/src/user-api/controller.ts` | Gateway sign/execute flow reference |
| `splice-wallet-kernel/sdk/dapp-sdk/src/sdk-controller.ts` | Official dapp-sdk prepareExecuteAndWait implementation |
| `splice-wallet-kernel/sdk/wallet-sdk/src/ledgerController.ts` | `createTransferPreapprovalCommand()` — builds Daml CreateCommand for TransferPreapprovalProposal |
| `cn-quickstart-dapp-core/dapp-core/src/modules/transfer-preapproval/transfer-preapproval.service.ts` | Reference: SDK-based transfer preapproval prepare/submit/status |
