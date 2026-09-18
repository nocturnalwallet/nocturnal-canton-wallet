# Password-on-Demand Signing & Inactivity-Only Auto-Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop caching the signing key for general use — decrypt it on demand per signing action and discard it — add a password field to the dApp approval popup, keep a narrowly-scoped RAM-only key only for silent auto-register, and make auto-lock a pure inactivity timeout.

**Architecture:** All user-initiated signing (transfers, faucet, manual pre-approval, dApp signMessage/signTransaction/prepareExecute) decrypts the key with a password supplied at signing time via a shared `sign-with-password` helper, then drops the reference. The dApp approval popup collects and verifies the password before resolving. `reconcileUnlockState` is deleted so only the inactivity alarm (and explicit lock/logout/network-switch) re-locks. One RAM-only variable survives, used solely to let silent auto-register-preapproval run after onboarding/unlock, cleared once a valid `TransferPreapproval` contractId is observed.

**Tech Stack:** WXT (Chrome MV3), React 19, TypeScript, Vitest (node env — import `describe/it/expect/vi` explicitly), `@canton-network/core-signing-lib`, `chrome.storage.session`.

**Spec:** `docs/superpowers/specs/2026-09-18-password-on-demand-signing-design.md`

## Global Constraints

- The decrypted private key must **never** be written to `chrome.storage.session`, `chrome.storage.local`, disk, or sent to the popup. It exists only as a transient local variable during a single sign call; drop the reference immediately after use.
- The one permitted RAM-only key (`_autoRegisterKey`) exists only for silent auto-register and is cleared on: a valid `TransferPreapproval` contractId, the auto-lock alarm, explicit lock, logout, and network switch.
- `unlocked` is a `chrome.storage.session` flag that **survives** service-worker restarts. The only setters of `unlocked=false` are: the auto-lock alarm, `handleLock`, `handleLogout`, and network switch.
- Auto-lock is `AUTO_LOCK_MINUTES` (15) of inactivity, reset on every non-read-only message. It is not screen-aware; no softeners.
- Tests run under node env; stub `globalThis.chrome` and `vi.mock('@lib/storage', …)` following the existing pattern in `entrypoints/background/handlers/session.handler.test.ts`.
- **Commit messages must contain no `Co-Authored-By` (or any co-author) trailer.** (Repo rule, `CLAUDE.md`.)

---

## File Structure

- `entrypoints/background/signing/sign-with-password.ts` — **new.** Shared decrypt→verify-fingerprint→sign helper. Owns `verifyKeyFingerprint`, `signHashWithPassword`, `signMessageWithPassword`.
- `entrypoints/background/handlers/session.handler.ts` — remove general cache + `reconcileUnlockState`; add `handleVerifyPassword`; add scoped auto-register cache API; `handleUnlock` no longer caches for general use.
- `entrypoints/background/handlers/approval.handler.ts` — approval result carries an optional password.
- `entrypoints/background/handlers/dapp-api.handler.ts` — dApp signing handlers accept a password ctx and use the shared helper; `buildDappAccount` reads `keystore.walletKey`.
- `entrypoints/background/handlers/api.handler.ts` — faucet is password-only.
- `entrypoints/background/handlers/keystore.handler.ts` — manual pre-approval takes a password; onboarding populates the scoped cache; auto-register consumes it and clears on confirmed contractId.
- `entrypoints/background.ts` — remove reconcile calls; route `VERIFY_PASSWORD`; forward password on `DAPP_APPROVAL_RESULT`.
- `entrypoints/popup/pages/approval/DappApproval.tsx` — password field + verify-on-approve.
- `entrypoints/popup/pages/dashboard/Settings.tsx` (or wherever manual register is triggered) — password prompt for manual pre-approval.
- `lib/messaging/constants.ts`, `lib/messaging/types.ts` — `VERIFY_PASSWORD`, extended `DAPP_APPROVAL_RESULT` payload.

---

## Task 1: Shared `sign-with-password` helper

**Files:**
- Create: `entrypoints/background/signing/sign-with-password.ts`
- Create: `entrypoints/background/signing/sign-with-password.test.ts`
- Modify: `entrypoints/background/handlers/signing.handler.ts` (delegate `signAndVerify` to the helper; import `verifyKeyFingerprint` from the new module instead of its local copy)

**Interfaces:**
- Produces:
  - `verifyKeyFingerprint(publicKeyBase64: string, partyId: string): Promise<void>` — throws on mismatch.
  - `signHashWithPassword(password: string, expectedPartyId: string | undefined, preparedTransactionHash: string): Promise<{ signature: string; publicKey: string }>` — decrypts, derives public key, verifies fingerprint **when `expectedPartyId` is provided**, signs the hash, drops the key reference. Throws `Error('No keystore found')` if absent; the encryption provider throws on wrong password.
  - `signMessageWithPassword(password: string, message: string): Promise<{ signature: string; publicKey: string }>` — decrypts, signs the UTF-8 message (CIP-0103 canonical), drops the reference.

- [ ] **Step 1: Write the failing test**

```typescript
// entrypoints/background/signing/sign-with-password.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createKeyPair, signTransactionHash } from '@canton-network/core-signing-lib';

vi.mock('@lib/storage', () => ({
  localStore: { get: vi.fn() },
}));
vi.mock('../encryption', () => ({
  getEncryptionProvider: vi.fn(),
}));

import { localStore } from '@lib/storage';
import { getEncryptionProvider } from '../encryption';
import { signHashWithPassword } from './sign-with-password';

const kp = createKeyPair(); // { privateKey, publicKey } base64

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(localStore.get).mockResolvedValue({
    cantonKey: 'enc', walletKey: kp.publicKey, hashedKey: 'h', backend: 'webcrypto', version: 1,
  });
  vi.mocked(getEncryptionProvider).mockResolvedValue({
    encryptKey: vi.fn(),
    verifyPassword: vi.fn(async () => true),
    decryptKey: vi.fn(async () => kp.privateKey),
  } as never);
});

it('signs a hash with the decrypted key (fingerprint check skipped when partyId undefined)', async () => {
  const hash = btoa('hello-hash');
  const res = await signHashWithPassword('pw', undefined, hash);
  expect(res.signature).toBe(signTransactionHash(hash, kp.privateKey));
  expect(res.publicKey).toBe(kp.publicKey);
});

it('throws when no keystore is present', async () => {
  vi.mocked(localStore.get).mockResolvedValue(undefined as never);
  await expect(signHashWithPassword('pw', undefined, btoa('x'))).rejects.toThrow('No keystore found');
});

it('throws on a partyId whose fingerprint does not match the key', async () => {
  const bogus = 'hint::1220deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  await expect(signHashWithPassword('pw', bogus, btoa('x'))).rejects.toThrow(/fingerprint/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test entrypoints/background/signing/sign-with-password.test.ts`
Expected: FAIL — cannot resolve `./sign-with-password`.

- [ ] **Step 3: Write the implementation**

```typescript
// entrypoints/background/signing/sign-with-password.ts
import {
  signTransactionHash,
  signMessage,
  getPublicKeyFromPrivate,
} from '@canton-network/core-signing-lib';
import { localStore } from '@lib/storage';
import { getEncryptionProvider } from '../encryption';

async function decrypt(password: string): Promise<string> {
  const keystore = await localStore.get('keystore');
  if (!keystore) throw new Error('No keystore found');
  const provider = await getEncryptionProvider();
  return provider.decryptKey(keystore, password);
}

/** Fingerprint = hex(0x1220 || SHA256(int32_be(12) || raw_pubkey_bytes)). */
export async function verifyKeyFingerprint(
  publicKeyBase64: string,
  partyId: string,
): Promise<void> {
  const raw = atob(publicKeyBase64);
  const pub = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) pub[i] = raw.charCodeAt(i);
  const prefixed = new Uint8Array(4 + pub.length);
  prefixed.set([0x00, 0x00, 0x00, 0x0c], 0);
  prefixed.set(pub, 4);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', prefixed));
  const fingerprint =
    '1220' + Array.from(digest).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (partyId.split('::')[1] !== fingerprint) {
    throw new Error('Key fingerprint mismatch — your signing key does not match your party ID.');
  }
}

export async function signHashWithPassword(
  password: string,
  expectedPartyId: string | undefined,
  preparedTransactionHash: string,
): Promise<{ signature: string; publicKey: string }> {
  const privateKey = await decrypt(password);
  const publicKey = getPublicKeyFromPrivate(privateKey);
  if (expectedPartyId) await verifyKeyFingerprint(publicKey, expectedPartyId);
  return { signature: signTransactionHash(preparedTransactionHash, privateKey), publicKey };
}

export async function signMessageWithPassword(
  password: string,
  message: string,
): Promise<{ signature: string; publicKey: string }> {
  const privateKey = await decrypt(password);
  const publicKey = getPublicKeyFromPrivate(privateKey);
  return { signature: signMessage(message, privateKey), publicKey };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test entrypoints/background/signing/sign-with-password.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor `signing.handler.ts` to use the helper**

In `signing.handler.ts`, delete the local `verifyKeyFingerprint` and rewrite `signAndVerify` to delegate:

```typescript
import { signHashWithPassword } from '../signing/sign-with-password';

async function signAndVerify(
  password: string,
  partyId: string,
  preparedTransactionHash: string,
): Promise<string> {
  const { signature } = await signHashWithPassword(password, partyId, preparedTransactionHash);
  return signature;
}
```

- [ ] **Step 6: Run the full suite + typecheck**

Run: `yarn test && yarn typecheck`
Expected: PASS (no regressions in signing.handler consumers).

- [ ] **Step 7: Commit**

```bash
git add entrypoints/background/signing/ entrypoints/background/handlers/signing.handler.ts
git commit -m "feat(signing): extract shared password-based signing helper"
```

---

## Task 2: `handleVerifyPassword` + `MSG.VERIFY_PASSWORD`

**Files:**
- Modify: `lib/messaging/constants.ts` (add `VERIFY_PASSWORD`)
- Modify: `lib/messaging/types.ts` (request union member + `VerifyPasswordData`)
- Modify: `entrypoints/background/handlers/session.handler.ts` (add `handleVerifyPassword`)
- Modify: `entrypoints/background.ts` (route the message)
- Test: `entrypoints/background/handlers/session.handler.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `EncryptionProvider.verifyPassword(bundle, password)` from `../encryption`.
- Produces: `handleVerifyPassword(password: string): Promise<MessageResponse<{ valid: boolean }>>`. Returns `ok({ valid: false })` when no keystore exists; **never** caches, **never** changes `unlocked`.

- [ ] **Step 1: Write the failing test**

```typescript
// append to session.handler.test.ts (top-level mocks already stub @lib/storage + ../encryption)
import { handleVerifyPassword } from './session.handler';
import { getEncryptionProvider } from '../encryption';
import { localStore } from '@lib/storage';

describe('handleVerifyPassword', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns valid:true for a correct password without touching session state', async () => {
    vi.mocked(localStore.get).mockResolvedValue({ backend: 'webcrypto' } as never);
    vi.mocked(getEncryptionProvider).mockResolvedValue({ verifyPassword: vi.fn(async () => true) } as never);
    const res = await handleVerifyPassword('pw');
    expect(res.success && res.data.valid).toBe(true);
    expect(sessionStore.set).not.toHaveBeenCalled();
  });

  it('returns valid:false for a wrong password', async () => {
    vi.mocked(localStore.get).mockResolvedValue({ backend: 'webcrypto' } as never);
    vi.mocked(getEncryptionProvider).mockResolvedValue({ verifyPassword: vi.fn(async () => false) } as never);
    const res = await handleVerifyPassword('bad');
    expect(res.success && res.data.valid).toBe(false);
  });

  it('returns valid:false when no keystore exists', async () => {
    vi.mocked(localStore.get).mockResolvedValue(undefined as never);
    const res = await handleVerifyPassword('pw');
    expect(res.success && res.data.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test entrypoints/background/handlers/session.handler.test.ts -t handleVerifyPassword`
Expected: FAIL — `handleVerifyPassword` is not exported.

- [ ] **Step 3: Add the constant, type, and handler**

In `lib/messaging/constants.ts` `MSG`:
```typescript
  VERIFY_PASSWORD: 'VERIFY_PASSWORD',
```
In `lib/messaging/types.ts` add to the request union and a data type:
```typescript
  | { action: typeof MSG.VERIFY_PASSWORD; payload: { password: string } }
```
```typescript
export interface VerifyPasswordData { valid: boolean }
```
In `session.handler.ts`:
```typescript
export async function handleVerifyPassword(
  password: string,
): Promise<MessageResponse<{ valid: boolean }>> {
  const keystore = await localStore.get('keystore');
  if (!keystore) return ok({ valid: false });
  const provider = await getEncryptionProvider();
  return ok({ valid: await provider.verifyPassword(keystore, password) });
}
```

- [ ] **Step 4: Route it in `background.ts`**

In `routeMessage`, add `MSG.VERIFY_PASSWORD` to the `skipReset` read-only list (verifying a password is not "activity"), and a case:
```typescript
    case MSG.VERIFY_PASSWORD:
      return handleVerifyPassword(message.payload.password);
```
Add `handleVerifyPassword` to the `session.handler` import block.

- [ ] **Step 5: Run test + typecheck**

Run: `yarn test entrypoints/background/handlers/session.handler.test.ts -t handleVerifyPassword && yarn typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/messaging entrypoints/background/handlers/session.handler.ts entrypoints/background/handlers/session.handler.test.ts entrypoints/background.ts
git commit -m "feat(session): add verify-only password check (no caching, no unlock)"
```

---

## Task 3: Approval result carries a password

**Files:**
- Modify: `entrypoints/background/handlers/approval.handler.ts`
- Modify: `lib/messaging/types.ts` (`DAPP_APPROVAL_RESULT` payload)
- Modify: `entrypoints/background.ts` (forward password to `resolveApproval`)
- Test: `entrypoints/background/handlers/approval.handler.test.ts` (new)

**Interfaces:**
- Produces:
  - `requestApproval(method: string, origin: string, params?: unknown): Promise<{ approved: boolean; password?: string }>`
  - `resolveApproval(requestId: string, approved: boolean, password?: string): void`

- [ ] **Step 1: Write the failing test**

```typescript
// entrypoints/background/handlers/approval.handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as { chrome?: unknown }).chrome = {
  runtime: { getURL: (p: string) => `chrome-extension://test/${p}` },
  windows: { onRemoved: { addListener: vi.fn() } },
};
vi.mock('@lib/utils', () => ({
  createCenteredPopup: vi.fn(async () => ({ id: 1 })),
}));

import { requestApproval, resolveApproval } from './approval.handler';

beforeEach(() => vi.clearAllMocks());

it('resolves with approved + password from resolveApproval', async () => {
  const p = requestApproval('signMessage', 'https://dapp.example', { message: 'hi' });
  // let the popup "open"
  await Promise.resolve();
  // find the requestId by resolving the only pending one via the popup URL is internal;
  // instead drive it through the exported resolver using the id the popup would receive.
  // requestApproval generates the id internally; capture it via getApprovalDetails is not
  // needed — resolveApproval is keyed by id, so we resolve through the crypto.randomUUID mock.
  resolveApproval((crypto.randomUUID as unknown as { mock: { results: { value: string }[] } }).mock.results[0].value, true, 'secret-pw');
  await expect(p).resolves.toEqual({ approved: true, password: 'secret-pw' });
});
```

> Note: stub `crypto.randomUUID` in the chrome setup block so the id is captured:
> add `crypto.randomUUID = vi.fn(() => 'req-1')` before importing, then call
> `resolveApproval('req-1', true, 'secret-pw')`. Use the simpler fixed-id form.

Simpler, deterministic version (use this):

```typescript
(globalThis as { crypto?: unknown }).crypto = { randomUUID: () => 'req-1' };
// ...
it('resolves with approved + password', async () => {
  const p = requestApproval('signMessage', 'https://dapp.example', { message: 'hi' });
  await Promise.resolve();
  resolveApproval('req-1', true, 'secret-pw');
  await expect(p).resolves.toEqual({ approved: true, password: 'secret-pw' });
});

it('resolves approved:false with no password on reject', async () => {
  const p = requestApproval('signMessage', 'https://dapp.example', {});
  await Promise.resolve();
  resolveApproval('req-1', false);
  await expect(p).resolves.toEqual({ approved: false, password: undefined });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test entrypoints/background/handlers/approval.handler.test.ts`
Expected: FAIL — `requestApproval` resolves to a boolean, not an object.

- [ ] **Step 3: Update `approval.handler.ts`**

```typescript
interface PendingApproval {
  data: DappApprovalData;
  resolve: (result: { approved: boolean; password?: string }) => void;
  windowId?: number;
}

export async function requestApproval(
  method: string,
  origin: string,
  params?: unknown,
): Promise<{ approved: boolean; password?: string }> {
  const requestId = crypto.randomUUID();
  const data: DappApprovalData = { requestId, method, origin, params };
  return new Promise((resolve) => {
    pendingApprovals.set(requestId, { data, resolve });
    const popupUrl = chrome.runtime.getURL(
      `/popup.html?window=1&action=dapp-approve&id=${requestId}`,
    );
    createCenteredPopup(popupUrl, 400, 620)
      .then((win) => {
        const pending = pendingApprovals.get(requestId);
        if (pending && win?.id != null) pending.windowId = win.id;
      })
      .catch(() => {
        pendingApprovals.delete(requestId);
        resolve({ approved: false });
      });
  });
}

export function resolveApproval(requestId: string, approved: boolean, password?: string): void {
  const pending = pendingApprovals.get(requestId);
  if (!pending) return;
  pendingApprovals.delete(requestId);
  pending.resolve({ approved, password });
}
```
Update the `onRemoved` handler in `setupApprovalWindowListener` to `pending.resolve({ approved: false })`.

- [ ] **Step 4: Update the type + background route**

`lib/messaging/types.ts`:
```typescript
  | { action: typeof MSG.DAPP_APPROVAL_RESULT; payload: { requestId: string; approved: boolean; password?: string } };
```
`background.ts` `DAPP_APPROVAL_RESULT` case:
```typescript
    case MSG.DAPP_APPROVAL_RESULT: {
      resolveApproval(message.payload.requestId, message.payload.approved, message.payload.password);
      return ok(null);
    }
```

- [ ] **Step 5: Run test + typecheck**

Run: `yarn test entrypoints/background/handlers/approval.handler.test.ts && yarn typecheck`
Expected: `dapp-api.handler.ts` will now have type errors where it does `if (!approved)` on an object — those are fixed in Task 4. If typecheck fails only in `dapp-api.handler.ts`, that is expected; proceed (Task 4 resolves it). The approval test passes.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/background/handlers/approval.handler.ts entrypoints/background/handlers/approval.handler.test.ts lib/messaging/types.ts entrypoints/background.ts
git commit -m "feat(approval): carry an optional password through the approval result"
```

---

## Task 4: dApp signing uses password-on-demand

**Files:**
- Modify: `entrypoints/background/handlers/dapp-api.handler.ts`
- Test: `entrypoints/background/handlers/dapp-api.handler.test.ts`

**Interfaces:**
- Consumes: `signHashWithPassword`, `signMessageWithPassword` (Task 1); `requestApproval` → `{ approved, password? }` (Task 3).
- Produces: internal handler signature `(params: unknown, ctx?: { password?: string }) => Promise<unknown>` for the `methods` map; `buildDappAccount` no longer reads the private key.

- [ ] **Step 1: Write the failing test**

```typescript
// in dapp-api.handler.test.ts — replace the session.handler mock and add sign-with-password mock
vi.mock('../signing/sign-with-password', () => ({
  signMessageWithPassword: vi.fn(async () => ({ signature: 'SIG_MSG', publicKey: 'PUB' })),
  signHashWithPassword: vi.fn(async () => ({ signature: 'SIG_HASH', publicKey: 'PUB' })),
  verifyKeyFingerprint: vi.fn(async () => {}),
}));
vi.mock('./approval.handler', () => ({
  APPROVAL_REQUIRED_METHODS: new Set(['connect', 'signMessage', 'signTransaction']),
  requestApproval: vi.fn(async () => ({ approved: true, password: 'pw' })),
}));

import { signMessageWithPassword } from '../signing/sign-with-password';

it('signMessage decrypts with the approval password and returns the signature', async () => {
  vi.mocked(sessionStore.get).mockImplementation(async (k) =>
    k === 'unlocked' ? true : k === 'partyId' ? TEST_PARTY_ID : (undefined as never));
  const res = await handleDappApiRequest(dappReq('signMessage', { message: 'hello' }), 'https://dapp');
  expect(vi.mocked(signMessageWithPassword)).toHaveBeenCalledWith('pw', 'hello');
  // @ts-expect-error narrowing the SpliceMessage response shape in test
  expect(res.response.result.signature).toBe('SIG_MSG');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test entrypoints/background/handlers/dapp-api.handler.test.ts -t "signMessage decrypts"`
Expected: FAIL — handler still uses `getCachedPrivateKey`.

- [ ] **Step 3: Rewrite the dApp signing handlers**

Change the `methods` map type and the gate to thread the password:
```typescript
type DappCtx = { password?: string };
// methods: Record<string, (params: unknown, ctx?: DappCtx) => Promise<unknown>>

// in handleDappApiRequest, the approval gate:
  let approvalPassword: string | undefined;
  if (APPROVAL_REQUIRED_METHODS.has(method)) {
    const origin = senderOrigin || 'Unknown origin';
    const { approved, password } = await requestApproval(method, origin, request.params);
    if (!approved) return jsonRpcError(id, RpcErrorCodes.USER_REJECTED, 'User rejected the request');
    approvalPassword = password;
  }
  // ...
    const result = await handler(request.params, { password: approvalPassword });
```
`handleSignMessage`:
```typescript
async function handleSignMessage(params: unknown, ctx?: DappCtx): Promise<{ signature: string }> {
  const { message } = (params || {}) as { message?: string };
  if (!message || typeof message !== 'string') {
    throw new RpcError(RpcErrorCodes.INVALID_PARAMS, 'Missing or invalid "message" parameter');
  }
  const { partyId, isReady } = await getWalletState();
  if (!isReady || !partyId) throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Wallet must be unlocked and onboarded to sign');
  if (!ctx?.password) throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Password required to sign');
  const { signature } = await signMessageWithPassword(ctx.password, message);
  resetAutoLockTimer();
  return { signature };
}
```
`handleSignTransaction` — same pattern, using `signHashWithPassword(ctx.password, partyId, transactionHash)`; return `{ signature, publicKey, fingerprint: partyId.split('::')[1] }`.

`handlePrepareExecute` / `handlePrepareExecuteAndWait` — capture the password from their inline approval and sign with it:
```typescript
  const { approved, password } = await requestApproval('prepareExecute', 'dApp', { ... });
  if (!approved) throw new RpcError(RpcErrorCodes.USER_REJECTED, 'User rejected the request');
  if (!password) throw new RpcError(RpcErrorCodes.UNAUTHORIZED, 'Password required to sign');
  // ...after the facade prepare returns tx.preparedTransactionHash:
  const { signature } = await signHashWithPassword(password, partyId, tx.preparedTransactionHash);
```
Remove every `getCachedPrivateKey()` call and its "Signing key not loaded" guard.

`buildDappAccount` — derive the public key from the keystore, not the private key:
```typescript
  let publicKey = '';
  const keystore = await localStore.get('keystore');
  if (keystore?.walletKey) publicKey = keystore.walletKey;
```
Remove the `getCachedPrivateKey`/`getPublicKeyFromPrivate` import usage here and drop the now-unused `getCachedPrivateKey` import.

- [ ] **Step 4: Run the dApp tests + typecheck**

Run: `yarn test entrypoints/background/handlers/dapp-api.handler.test.ts && yarn typecheck`
Expected: PASS (and the Task 3 typecheck error is now resolved).

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background/handlers/dapp-api.handler.ts entrypoints/background/handlers/dapp-api.handler.test.ts
git commit -m "feat(dapp-api): sign with an approval-supplied password, drop cached-key reliance"
```

---

## Task 5: dApp approval popup password field + verify-on-approve

**Files:**
- Modify: `entrypoints/popup/pages/approval/DappApproval.tsx`

**Interfaces:**
- Consumes: `MSG.VERIFY_PASSWORD` → `{ valid }` (Task 2); `DAPP_APPROVAL_RESULT` payload with `password` (Task 3).

> No unit test — the repo runs vitest in node env with no React DOM harness. Verify via `yarn typecheck`, `yarn build:nocturnal`, and the manual dApp flow in `docs/testing-guide-nocturnal.md` §4.

- [ ] **Step 1: Add password state + a signing-method flag**

```tsx
const SIGNING_METHODS = new Set(['signMessage', 'signTransaction', 'prepareExecute', 'prepareExecuteAndWait']);
const [password, setPassword] = useState('');
const [pwError, setPwError] = useState('');
// after details load:
const needsPassword = details ? SIGNING_METHODS.has(details.method) : false;
```

- [ ] **Step 2: Render the password input (signing methods only)**

Inside the content area, before the actions, when `needsPassword`:
```tsx
{needsPassword && (
  <div className="w-full">
    <input
      type="password"
      value={password}
      onChange={(e) => { setPassword(e.target.value); setPwError(''); }}
      placeholder="Password to sign"
      className="bg-secondary text-foreground w-full rounded-lg px-4 py-3 text-sm"
    />
    {pwError && <p className="text-destructive mt-1 text-xs">{pwError}</p>}
  </div>
)}
```

- [ ] **Step 3: Verify-on-approve, then resolve with the password**

```tsx
const handleResult = async (approved: boolean) => {
  setSubmitting(true);
  try {
    if (approved && needsPassword) {
      const res = await sendMessage<{ valid: boolean }>({
        action: MSG.VERIFY_PASSWORD, payload: { password },
      });
      if (!res?.valid) {
        setPwError('Invalid password');
        setSubmitting(false);
        return; // keep window open
      }
    }
    await sendMessage({
      action: MSG.DAPP_APPROVAL_RESULT,
      payload: { requestId, approved, password: approved && needsPassword ? password : undefined },
    });
  } catch {
    // Background will clean up on window close
  }
  window.close();
};
```
Disable the Approve button while `needsPassword && !password`.

- [ ] **Step 4: Verify build + typecheck**

Run: `yarn typecheck && yarn build:nocturnal`
Expected: PASS. Then load `build/nocturnal-chrome-mv3` and confirm a dApp `signMessage`/`signTransaction` shows a password field; a wrong password shows "Invalid password" and keeps the window open; a correct one signs. `connect` shows no password field.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/pages/approval/DappApproval.tsx
git commit -m "feat(approval-ui): password field with verify-on-approve for dApp signing"
```

---

## Task 6: Faucet is password-only (no silent cached-key success)

**Files:**
- Modify: `entrypoints/background/handlers/api.handler.ts` (`handleRequestFaucet`)
- Test: `entrypoints/background/handlers/api.handler.test.ts` (add or create)

**Interfaces:**
- Consumes: `signHashWithPassword` (Task 1).

- [ ] **Step 1: Write the failing test**

```typescript
// verify the faucet signs with the password (no cached-key branch)
vi.mock('../signing/sign-with-password', () => ({
  signHashWithPassword: vi.fn(async () => ({ signature: 'FAUCET_SIG', publicKey: 'PUB' })),
}));
// arrange apiClient.post to return a prepared tx, then assert signHashWithPassword called with the password
it('signs the faucet tap with the typed password', async () => {
  // ...mock sessionStore.get('partyId'), apiClient.post prepare → { data: { preparedTransactionHash, preparedTransaction } }
  const res = await handleRequestFaucet('typed-pw', '100');
  expect(vi.mocked(signHashWithPassword)).toHaveBeenCalledWith('typed-pw', expect.any(String), expect.any(String));
  expect(res.success).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test entrypoints/background/handlers/api.handler.test.ts -t faucet`
Expected: FAIL — handler still branches on `getCachedPrivateKey()`.

- [ ] **Step 3: Rewrite `handleRequestFaucet`**

Replace the cached-key-preferred block with a single password decrypt+sign via the shared helper:
```typescript
  const partyId = await sessionStore.get('partyId');
  if (!partyId) return err('No party ID');
  // Step 1: prepare
  const { data: prepareRes } = await apiClient.post('/external-party/devnet-tap/prepare', { partyId, amount });
  const prepared = prepareRes.data;
  if (!prepared?.preparedTransactionHash) return err('Faucet prepare returned no transaction hash');
  // Step 2: sign locally with the typed password (fails on wrong password)
  const { signature } = await signHashWithPassword(password, partyId, prepared.preparedTransactionHash);
  // Step 3: submit ...
```
Remove the `getCachedPrivateKey` import if now unused in this file.

- [ ] **Step 4: Run test + typecheck**

Run: `yarn test entrypoints/background/handlers/api.handler.test.ts && yarn typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background/handlers/api.handler.ts entrypoints/background/handlers/api.handler.test.ts
git commit -m "fix(faucet): always sign with the typed password (reject wrong password)"
```

---

## Task 7: Manual pre-approval registration takes a password

**Files:**
- Modify: `entrypoints/background/handlers/keystore.handler.ts` (`handleRegisterTransferPreapproval`)
- Modify: `lib/messaging/types.ts` (`REGISTER_TRANSFER_PREAPPROVAL` payload gains `{ password: string }`)
- Modify: `entrypoints/background.ts` (pass `message.payload.password`)
- Modify: the popup trigger (locate with `rg -n "REGISTER_TRANSFER_PREAPPROVAL" entrypoints/popup`) to collect a password
- Test: `entrypoints/background/handlers/keystore.handler.test.ts` (add or create)

**Interfaces:**
- Consumes: `signHashWithPassword` (Task 1).
- Produces: `handleRegisterTransferPreapproval(password: string)`.

- [ ] **Step 1: Write the failing test**

```typescript
vi.mock('../signing/sign-with-password', () => ({
  signHashWithPassword: vi.fn(async () => ({ signature: 'PREAPP_SIG', publicKey: 'PUB' })),
}));
it('signs the preapproval with the supplied password', async () => {
  // mock sessionStore.get('partyId'); apiClient.post prepare → { data: { preparedTransactionHash, preparedTransaction } }
  const res = await handleRegisterTransferPreapproval('typed-pw');
  expect(vi.mocked(signHashWithPassword)).toHaveBeenCalledWith('typed-pw', expect.any(String), expect.any(String));
  expect(res.success).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test entrypoints/background/handlers/keystore.handler.test.ts -t preapproval`
Expected: FAIL — handler takes no password and uses the cached key.

- [ ] **Step 3: Rewrite the handler + wire the payload/route/UI**

Handler:
```typescript
export async function handleRegisterTransferPreapproval(
  password: string,
): Promise<MessageResponse<{ success: boolean }>> {
  const partyId = await sessionStore.get('partyId');
  if (!partyId) return err('No party ID');
  const { data: prepareRes } = await apiClient.post('/wallet/transfer-preapproval/prepare', { partyId });
  const prepared = prepareRes.data;
  if (!prepared?.preparedTransactionHash) return err('Preapproval prepare returned no transaction hash');
  const { signature } = await signHashWithPassword(password, partyId, prepared.preparedTransactionHash);
  // ...submit as before with `signature`
}
```
Type: `{ action: typeof MSG.REGISTER_TRANSFER_PREAPPROVAL; payload: { password: string } }`.
`background.ts`: `return handleRegisterTransferPreapproval(message.payload.password);`
UI: add a password input to the manual-register control and pass it in the `sendMessage` payload.

- [ ] **Step 4: Run test + typecheck**

Run: `yarn test entrypoints/background/handlers/keystore.handler.test.ts && yarn typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background/handlers/keystore.handler.ts lib/messaging entrypoints/background.ts entrypoints/popup
git commit -m "feat(preapproval): manual registration signs with a supplied password"
```

---

## Task 8: Delete `reconcileUnlockState` → inactivity-only lock

**Files:**
- Modify: `entrypoints/background/handlers/session.handler.ts`
- Modify: `entrypoints/background.ts`
- Modify: `entrypoints/background/handlers/dapp-api.handler.ts` (drop the `reconcileUnlockState` import if still present)
- Test: `entrypoints/background/handlers/session.handler.test.ts`

**Interfaces:**
- Produces: `handleGetLockState()` returns the stored flag with no side effects. `reconcileUnlockState` no longer exists.

- [ ] **Step 1: Replace the reconcile tests with the new invariant**

Delete the `describe('reconcileUnlockState', …)` block and rewrite `handleGetLockState`'s test:
```typescript
describe('handleGetLockState', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports the stored unlocked flag without side effects (survives SW restart)', async () => {
    vi.mocked(sessionStore.get).mockResolvedValue(true); // unlocked persisted, RAM key gone
    const res = await handleGetLockState();
    expect(res.success && res.data.unlocked).toBe(true);
    expect(sessionStore.set).not.toHaveBeenCalled(); // no forced re-lock
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test entrypoints/background/handlers/session.handler.test.ts -t handleGetLockState`
Expected: FAIL — current `handleGetLockState` calls `reconcileUnlockState` and sets `unlocked=false`.

- [ ] **Step 3: Delete reconcile and its call sites**

In `session.handler.ts`: delete `reconcileUnlockState`; make `handleGetLockState`:
```typescript
export async function handleGetLockState(): Promise<MessageResponse<LockStateData>> {
  return ok({ unlocked: await sessionStore.get('unlocked') });
}
```
In `background.ts`: remove the `reconcileUnlockState` import and the `void whenStorageReady().then(() => reconcileUnlockState());` line.
In `dapp-api.handler.ts`: remove `reconcileUnlockState` from the `session.handler` import (already unused after Task 4).

- [ ] **Step 4: Run the full suite + typecheck**

Run: `yarn test && yarn typecheck`
Expected: PASS. No remaining reference to `reconcileUnlockState` (`rg -n reconcileUnlockState` returns nothing).

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background/handlers/session.handler.ts entrypoints/background/handlers/session.handler.test.ts entrypoints/background.ts entrypoints/background/handlers/dapp-api.handler.ts
git commit -m "fix(session): re-lock only on inactivity timeout; delete reconcileUnlockState"
```

---

## Task 9: Scope the surviving cache to auto-register only

**Files:**
- Modify: `entrypoints/background/handlers/session.handler.ts` (rename cache API + gating)
- Modify: `entrypoints/background/handlers/keystore.handler.ts` (onboarding populate; auto-register consume + clear on contractId)
- Modify: `entrypoints/background/handlers/network.handler.ts`, `auth.handler.ts` (clear the renamed cache)
- Test: `entrypoints/background/handlers/session.handler.test.ts`, `keystore.handler.test.ts`

**Interfaces:**
- Produces:
  - `setAutoRegisterKey(key: string | null): void`, `getAutoRegisterKey(): string | null`, `clearAutoRegisterKey(): void`
  - `maybeCacheAutoRegisterKey(privateKey: string): Promise<void>` — stores the key only when `sessionStore.get('shouldAutoRegisterPreapproval') === true`.

- [ ] **Step 1: Write the failing tests**

```typescript
import { maybeCacheAutoRegisterKey, getAutoRegisterKey, clearAutoRegisterKey } from './session.handler';

describe('scoped auto-register key', () => {
  beforeEach(() => { vi.clearAllMocks(); clearAutoRegisterKey(); });

  it('caches the key only when auto-register is pending', async () => {
    vi.mocked(sessionStore.get).mockResolvedValue(true); // shouldAutoRegisterPreapproval
    await maybeCacheAutoRegisterKey('sk');
    expect(getAutoRegisterKey()).toBe('sk');
  });

  it('does not cache when auto-register is not pending', async () => {
    vi.mocked(sessionStore.get).mockResolvedValue(false);
    await maybeCacheAutoRegisterKey('sk');
    expect(getAutoRegisterKey()).toBeNull();
  });

  it('clearAutoRegisterKey empties it', async () => {
    vi.mocked(sessionStore.get).mockResolvedValue(true);
    await maybeCacheAutoRegisterKey('sk');
    clearAutoRegisterKey();
    expect(getAutoRegisterKey()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn test entrypoints/background/handlers/session.handler.test.ts -t "scoped auto-register"`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Rename + implement the scoped cache**

In `session.handler.ts`, replace `_cachedPrivateKey` / `setCachedPrivateKey` / `getCachedPrivateKey` with:
```typescript
let _autoRegisterKey: string | null = null;
export function setAutoRegisterKey(key: string | null): void { _autoRegisterKey = key; }
export function getAutoRegisterKey(): string | null { return _autoRegisterKey; }
export function clearAutoRegisterKey(): void { _autoRegisterKey = null; }

export async function maybeCacheAutoRegisterKey(privateKey: string): Promise<void> {
  if (await sessionStore.get('shouldAutoRegisterPreapproval')) _autoRegisterKey = privateKey;
}
```
- `setupAutoLock` alarm listener → `_autoRegisterKey = null`.
- `handleLock` → `_autoRegisterKey = null`.
- `handleUnlock`: after verifying the password, decrypt once and call `maybeCacheAutoRegisterKey(privateKey)` (no general caching); drop the local reference otherwise.

In `network.handler.ts` and `auth.handler.ts`: replace `setCachedPrivateKey(null)` with `clearAutoRegisterKey()`.

In `keystore.handler.ts`:
- onboarding (`handleCompleteOnboarding`): replace `setCachedPrivateKey(privateKey)` with `await maybeCacheAutoRegisterKey(privateKey)`.
- `handleMaybeAutoRegisterPreapproval`: replace `getCachedPrivateKey()` with `getAutoRegisterKey()`; on a confirmed valid `TransferPreapproval` contractId (the existing "already registered" success path and the status check), call `clearAutoRegisterKey()`.

- [ ] **Step 4: Run the full suite + typecheck**

Run: `yarn test && yarn typecheck`
Expected: PASS. `rg -n "getCachedPrivateKey|setCachedPrivateKey|_cachedPrivateKey"` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background/handlers/session.handler.ts entrypoints/background/handlers/keystore.handler.ts entrypoints/background/handlers/network.handler.ts entrypoints/background/handlers/auth.handler.ts entrypoints/background/handlers/session.handler.test.ts entrypoints/background/handlers/keystore.handler.test.ts
git commit -m "feat(session): scope the surviving key cache to silent auto-register only"
```

---

## Task 10: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Gates**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all green (lint may show the 3 pre-existing `elfa-shared.tsx` warnings; 0 errors).

- [ ] **Step 2: No stale references**

Run: `rg -n "getCachedPrivateKey|setCachedPrivateKey|reconcileUnlockState|_cachedPrivateKey"`
Expected: no matches.

- [ ] **Step 3: Build + manual smoke (per `docs/testing-guide-nocturnal.md`)**

Run: `yarn build:nocturnal`, load `build/nocturnal-chrome-mv3`, and confirm:
- Unlock, sit idle < 15 min with the popup closed/reopened → **stays unlocked** (re-lock bug gone).
- Transfer: password required, wrong password rejected.
- Faucet: wrong password now **fails** (no silent success).
- dApp connect: no password field. dApp signMessage/execute: password field, wrong password keeps window open, correct password signs.
- Leave idle 15 min → locks to Unlock from any screen.

- [ ] **Step 4: Final commit (if any doc/cleanup changes)**

```bash
git add -A
git commit -m "chore: verification pass for password-on-demand signing"
```

---

## Self-Review

- **Spec coverage:** §3 password-on-demand → Tasks 1, 4, 6, 7; §4 dApp password field → Tasks 2, 3, 5; §5 scoped auto-register cache → Task 9; §6 inactivity-only lock → Task 8; faucet bug (§1/§3.2) → Task 6; `buildDappAccount` pubkey source (§3.2) → Task 4. All covered.
- **Placeholder scan:** every code/test step contains concrete code; UI Task 5 has no unit test by design (node env, no DOM harness) and states its build+manual verification explicitly.
- **Type consistency:** `signHashWithPassword`/`signMessageWithPassword` signatures match across Tasks 1/4/6/7; `requestApproval`/`resolveApproval` object shape consistent across Tasks 3/4; cache renamed once in Task 9 with all call sites (session/keystore/network/auth) updated together.
