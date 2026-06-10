# Keystore Mismatch Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect at sign-in time when the wallet's local keystore doesn't match the backend's `party.publicKey`, and route the user to a recovery screen with two clear options ("Sign out" or "Wipe and re-import") before they reach the dashboard.

**Architecture:** `handleGoogleAuth` (background) gains a `keyMismatch` field in its response, computed by comparing `keystore.walletKey` to `party.publicKey` after `/auth/me`. `App.tsx` (popup) stores `keyMismatch` as React state, routes to a new `KeyMismatch.tsx` screen before the unlock/onboardingComplete checks, and offers two recovery paths. The destructive wipe goes through a new narrow background handler (`handleResetKeystoreForRecovery`) — explicitly NOT `handleDeleteKeystore`, which would clear `sessionStore.partyStatus` and break the subsequent re-import.

**Tech Stack:** WXT 0.20 (Chrome MV3 + Firefox MV2), React 19, TypeScript strict, axios, Vitest 4. No new dependencies.

**Source spec:** `docs/superpowers/specs/2026-06-10-keystore-mismatch-recovery-design.md`

---

## File structure (created or modified by this plan)

```
entrypoints/background/handlers/
├── auth.handler.ts                                # MODIFY: compute + return keyMismatch in handleGoogleAuth
├── auth.handler.test.ts                           # NEW: Vitest tests for handleGoogleAuth mismatch detection
├── keystore.handler.ts                            # MODIFY: add handleResetKeystoreForRecovery export
└── keystore.handler.test.ts                       # NEW: Vitest tests for the new handler

entrypoints/background.ts                          # MODIFY: route MSG.RESET_KEYSTORE_FOR_RECOVERY

entrypoints/popup/pages/onboarding/
├── KeyMismatch.tsx                                # NEW: the mismatch screen
└── ConfirmDeleteModal.tsx                         # NEW: typed-DELETE confirmation modal

entrypoints/popup/App.tsx                          # MODIFY: keyMismatch state + routing + new screen wiring
entrypoints/popup/pages/onboarding/Welcome.tsx     # (no code change — verify GoogleAuthData forwarding is intact)

lib/messaging/
├── constants.ts                                   # MODIFY: add MSG.RESET_KEYSTORE_FOR_RECOVERY
└── types.ts                                       # MODIFY: GoogleAuthData.keyMismatch + new MessageRequest variant
```

**Branching strategy:** all work on the current feature branch `feat/keystore-mismatch-recovery` (already checked out, spec is committed there at `68da2f5`). Each task is one or more small commits.

---

## Task 1: Extend `MSG` constants and request types

**Why:** Wire up the new background message before any consumer references it. Pure type-level change.

**Files:**
- Modify: `lib/messaging/constants.ts`
- Modify: `lib/messaging/types.ts`

- [ ] **Step 1: Add the new `MSG` constant**

In `lib/messaging/constants.ts`, in the `Keystore` block (next to `DELETE_KEYSTORE`), add:

```ts
RESET_KEYSTORE_FOR_RECOVERY: 'RESET_KEYSTORE_FOR_RECOVERY',
```

So the keystore block reads:

```ts
  // Keystore
  CREATE_KEYPAIR: 'CREATE_KEYPAIR',
  VALIDATE_IMPORT_KEY: 'VALIDATE_IMPORT_KEY',
  PREPARE_ONBOARDING: 'PREPARE_ONBOARDING',
  COMPLETE_ONBOARDING: 'COMPLETE_ONBOARDING',
  EXPORT_PRIVATE_KEY: 'EXPORT_PRIVATE_KEY',
  DELETE_KEYSTORE: 'DELETE_KEYSTORE',
  RESET_KEYSTORE_FOR_RECOVERY: 'RESET_KEYSTORE_FOR_RECOVERY',
```

- [ ] **Step 2: Add the new `MessageRequest` variant**

In `lib/messaging/types.ts`, in the `MessageRequest` union (next to the `DELETE_KEYSTORE` variant), add:

```ts
  | { action: typeof MSG.RESET_KEYSTORE_FOR_RECOVERY }
```

(No payload — the handler operates purely on the active user-scope set by an earlier `setUserScope(user.id)` call inside `handleGoogleAuth`.)

- [ ] **Step 3: Extend `GoogleAuthData` with the `keyMismatch` field**

Same file, find the `GoogleAuthData` interface (around line 154) and add `keyMismatch`:

```ts
export interface GoogleAuthData {
  token: string;
  user: User;
  partyId: string;
  partyStatus: 'PENDING' | 'SUCCESSFULLY' | 'DEACTIVATED';
  publicKey: string;
  onboardingComplete: boolean;
  keyMismatch: boolean;        // ← NEW
}
```

(Non-optional — `handleGoogleAuth` will always return a definite boolean, never `undefined`.)

- [ ] **Step 4: typecheck**

```bash
yarn typecheck
```

Expected: pass. No consumers yet — the new field is in the type but unused everywhere.

- [ ] **Step 5: Commit**

```bash
git add lib/messaging/constants.ts lib/messaging/types.ts
git commit -m "feat(messaging): add MSG.RESET_KEYSTORE_FOR_RECOVERY + GoogleAuthData.keyMismatch"
```

---

## Task 2: `handleResetKeystoreForRecovery` background handler + tests

**Why:** TDD a narrow handler that wipes `localStore.keystore` + `localStore.onboardingComplete` but DOES NOT touch `sessionStore` (which preserves `partyStatus = 'SUCCESSFULLY'` for the subsequent re-import).

**Files:**
- Modify: `entrypoints/background/handlers/keystore.handler.ts`
- Create: `entrypoints/background/handlers/keystore.handler.test.ts`

- [ ] **Step 1: Write failing tests first**

`entrypoints/background/handlers/keystore.handler.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleResetKeystoreForRecovery } from './keystore.handler';

vi.mock('@lib/storage', () => ({
  localStore: {
    set: vi.fn(),
    get: vi.fn(),
  },
  sessionStore: {
    clear: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

import { localStore, sessionStore } from '@lib/storage';

describe('handleResetKeystoreForRecovery', () => {
  beforeEach(() => {
    vi.mocked(localStore.set).mockReset();
    vi.mocked(sessionStore.clear).mockReset();
  });

  it('sets keystore to null and onboardingComplete to false', async () => {
    const result = await handleResetKeystoreForRecovery();
    expect(result).toEqual({ ok: true, data: null });
    expect(localStore.set).toHaveBeenCalledWith('keystore', null);
    expect(localStore.set).toHaveBeenCalledWith('onboardingComplete', false);
  });

  it('does NOT clear sessionStore', async () => {
    await handleResetKeystoreForRecovery();
    expect(sessionStore.clear).not.toHaveBeenCalled();
  });

  it('returns err when localStore.set throws', async () => {
    vi.mocked(localStore.set).mockRejectedValueOnce(new Error('storage write failed'));
    const result = await handleResetKeystoreForRecovery();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/storage write failed/);
    }
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
yarn test entrypoints/background/handlers/keystore.handler.test.ts
```

Expected: 3 tests fail with `handleResetKeystoreForRecovery is not a function` or import error.

- [ ] **Step 3: Implement the handler**

In `entrypoints/background/handlers/keystore.handler.ts`, add a new export right after the existing `handleDeleteKeystore` function (around line 294):

```ts
/**
 * Narrow recovery wipe for the keystore-mismatch-recovery flow.
 *
 * Unlike handleDeleteKeystore, this does NOT clear sessionStore — preserving
 * sessionStore.partyStatus='SUCCESSFULLY' so that the subsequent
 * handleCompleteOnboarding call skips the party-creation block (it would
 * otherwise re-run /external-party/onboarding/* for an already-onboarded user).
 *
 * See: docs/superpowers/specs/2026-06-10-keystore-mismatch-recovery-design.md §4 property 3.
 */
export async function handleResetKeystoreForRecovery(): Promise<MessageResponse<null>> {
  try {
    await localStore.set('keystore', null);
    await localStore.set('onboardingComplete', false);
    return ok(null);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Failed to reset keystore for recovery');
  }
}
```

The `ok` / `err` / `MessageResponse` / `localStore` imports already exist at the top of the file. No new imports needed.

- [ ] **Step 4: Run tests, verify they pass**

```bash
yarn test entrypoints/background/handlers/keystore.handler.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
yarn test
```

Expected: 31 prior tests + 3 new = 34 passing.

- [ ] **Step 6: typecheck**

```bash
yarn typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add entrypoints/background/handlers/keystore.handler.ts \
        entrypoints/background/handlers/keystore.handler.test.ts
git commit -m "feat(keystore): add handleResetKeystoreForRecovery (narrow wipe, preserves sessionStore)"
```

---

## Task 3: Route `MSG.RESET_KEYSTORE_FOR_RECOVERY` in `background.ts`

**Why:** Wire the new handler into the message router so the popup can reach it.

**Files:**
- Modify: `entrypoints/background.ts`

- [ ] **Step 1: Update the keystore handler import**

In `entrypoints/background.ts`, find the import block from `./background/handlers/keystore.handler` (around line 21-30):

```ts
import {
  handleCreateKeypair,
  handleValidateImportKey,
  handlePrepareOnboarding,
  handleCompleteOnboarding,
  handleExportPrivateKey,
  handleDeleteKeystore,
  handleRegisterTransferPreapproval,
  handleGetPreapprovalStatus,
} from './background/handlers/keystore.handler';
```

Add `handleResetKeystoreForRecovery` to the named imports:

```ts
import {
  handleCreateKeypair,
  handleValidateImportKey,
  handlePrepareOnboarding,
  handleCompleteOnboarding,
  handleExportPrivateKey,
  handleDeleteKeystore,
  handleResetKeystoreForRecovery,   // ← NEW
  handleRegisterTransferPreapproval,
  handleGetPreapprovalStatus,
} from './background/handlers/keystore.handler';
```

- [ ] **Step 2: Add the route in `routeMessage`**

In the `switch (message.action)` block in `routeMessage` (the keystore section, near the `MSG.DELETE_KEYSTORE` case around line 174-175):

```ts
    case MSG.DELETE_KEYSTORE:
      return handleDeleteKeystore();
```

Add right after:

```ts
    case MSG.RESET_KEYSTORE_FOR_RECOVERY:
      return handleResetKeystoreForRecovery();
```

- [ ] **Step 3: typecheck + build**

```bash
yarn typecheck && yarn build
```

Expected: both exit 0.

- [ ] **Step 4: Run tests**

```bash
yarn test
```

Expected: 34 still passing (no new tests in this task).

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat(background): route MSG.RESET_KEYSTORE_FOR_RECOVERY"
```

---

## Task 4: Mismatch detection in `handleGoogleAuth` + tests

**Why:** The detection point. After `/auth/me` returns, compare `keystore.walletKey` to `party.publicKey` and add the result to the response.

**Files:**
- Modify: `entrypoints/background/handlers/auth.handler.ts`
- Create: `entrypoints/background/handlers/auth.handler.test.ts`

- [ ] **Step 1: Write failing tests first**

`entrypoints/background/handlers/auth.handler.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@lib/storage', () => ({
  localStore: { get: vi.fn(), set: vi.fn() },
  sessionStore: { set: vi.fn(), setMany: vi.fn(), clear: vi.fn(), get: vi.fn() },
  setUserScope: vi.fn(),
}));

vi.mock('../api-client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('./session.handler', () => ({
  setCachedPrivateKey: vi.fn(),
  clearPreapprovalCache: vi.fn(),
}));

vi.mock('@lib/storage/auth-helpers', () => ({}), { virtual: true });

// Mock chrome.identity for the Google OAuth flow
(globalThis as any).chrome = {
  identity: {
    getAuthToken: vi.fn(),
    launchWebAuthFlow: vi.fn(),
    removeCachedAuthToken: vi.fn(),
  },
  alarms: { clear: vi.fn() },
};

import { handleGoogleAuth } from './auth.handler';
import apiClient from '../api-client';
import { localStore } from '@lib/storage';

const PK_BACKEND = 'E8EiDJyl6LIO4OHpGwBd4s3e8hfcqCjQ++4h2lwWsDo=';
const PK_LOCAL_DIFFERENT = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

describe('handleGoogleAuth — keystore mismatch detection', () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(localStore.get).mockReset();
    consoleWarnSpy.mockClear();

    // Default Google sign-in flow (mock chrome.identity to return a fake id_token)
    (globalThis as any).chrome.identity.launchWebAuthFlow.mockImplementation(
      (_opts: unknown, cb: (url: string) => void) => cb('https://fake?id_token=fake-google-token'),
    );
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { data: { token: 'tok', refreshToken: 'rtok', user: { id: 'u1', email: 'x@y' } } },
    } as any);
  });

  function mockAuthMe(party: unknown) {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: { party } } } as any);
  }

  it('returns keyMismatch: true when keystore.walletKey !== party.publicKey AND party is SUCCESSFULLY', async () => {
    mockAuthMe({ partyId: 'p1', publicKey: PK_BACKEND, onboardingStatus: 'SUCCESSFULLY' });
    vi.mocked(localStore.get).mockImplementation(async (key: string) => {
      if (key === 'keystore') return { walletKey: PK_LOCAL_DIFFERENT, cipher: 'x', salt: 'y', iv: 'z' };
      if (key === 'onboardingComplete') return true;
      return null;
    });
    const result = await handleGoogleAuth();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.keyMismatch).toBe(true);
  });

  it('returns keyMismatch: false when keystore.walletKey === party.publicKey', async () => {
    mockAuthMe({ partyId: 'p1', publicKey: PK_BACKEND, onboardingStatus: 'SUCCESSFULLY' });
    vi.mocked(localStore.get).mockImplementation(async (key: string) => {
      if (key === 'keystore') return { walletKey: PK_BACKEND, cipher: 'x', salt: 'y', iv: 'z' };
      if (key === 'onboardingComplete') return true;
      return null;
    });
    const result = await handleGoogleAuth();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.keyMismatch).toBe(false);
  });

  it('returns keyMismatch: false when no keystore exists locally', async () => {
    mockAuthMe({ partyId: 'p1', publicKey: PK_BACKEND, onboardingStatus: 'SUCCESSFULLY' });
    vi.mocked(localStore.get).mockImplementation(async (key: string) => {
      if (key === 'keystore') return null;
      if (key === 'onboardingComplete') return false;
      return null;
    });
    const result = await handleGoogleAuth();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.keyMismatch).toBe(false);
  });

  it('returns keyMismatch: false when party.onboardingStatus is PENDING', async () => {
    mockAuthMe({ partyId: 'p1', publicKey: PK_BACKEND, onboardingStatus: 'PENDING' });
    vi.mocked(localStore.get).mockImplementation(async (key: string) => {
      if (key === 'keystore') return { walletKey: PK_LOCAL_DIFFERENT, cipher: 'x', salt: 'y', iv: 'z' };
      if (key === 'onboardingComplete') return true;
      return null;
    });
    const result = await handleGoogleAuth();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.keyMismatch).toBe(false);
  });

  it('returns keyMismatch: false when party.publicKey is empty string', async () => {
    mockAuthMe({ partyId: 'p1', publicKey: '', onboardingStatus: 'SUCCESSFULLY' });
    vi.mocked(localStore.get).mockImplementation(async (key: string) => {
      if (key === 'keystore') return { walletKey: PK_LOCAL_DIFFERENT, cipher: 'x', salt: 'y', iv: 'z' };
      if (key === 'onboardingComplete') return true;
      return null;
    });
    const result = await handleGoogleAuth();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.keyMismatch).toBe(false);
  });

  it('returns keyMismatch: false when /auth/me returns party: null', async () => {
    mockAuthMe(null);
    vi.mocked(localStore.get).mockImplementation(async (key: string) => {
      if (key === 'keystore') return { walletKey: PK_LOCAL_DIFFERENT, cipher: 'x', salt: 'y', iv: 'z' };
      if (key === 'onboardingComplete') return true;
      return null;
    });
    const result = await handleGoogleAuth();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.keyMismatch).toBe(false);
  });

  it('returns keyMismatch: false when existingKeystore.walletKey is undefined (legacy shape)', async () => {
    mockAuthMe({ partyId: 'p1', publicKey: PK_BACKEND, onboardingStatus: 'SUCCESSFULLY' });
    vi.mocked(localStore.get).mockImplementation(async (key: string) => {
      if (key === 'keystore') return { cipher: 'x', salt: 'y', iv: 'z' }; // no walletKey
      if (key === 'onboardingComplete') return true;
      return null;
    });
    const result = await handleGoogleAuth();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.keyMismatch).toBe(false);
  });

  it('emits console.warn with truncated keys when mismatch detected', async () => {
    mockAuthMe({ partyId: 'p1', publicKey: PK_BACKEND, onboardingStatus: 'SUCCESSFULLY' });
    vi.mocked(localStore.get).mockImplementation(async (key: string) => {
      if (key === 'keystore') return { walletKey: PK_LOCAL_DIFFERENT, cipher: 'x', salt: 'y', iv: 'z' };
      if (key === 'onboardingComplete') return true;
      return null;
    });
    await handleGoogleAuth();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Keystore mismatch detected'),
      expect.objectContaining({
        expected: expect.stringMatching(/^.{1,16}…$/),
        actual: expect.stringMatching(/^.{1,16}…$/),
      }),
    );
  });

  it('does not throw when localStore.get throws — falls back to keyMismatch: false', async () => {
    mockAuthMe({ partyId: 'p1', publicKey: PK_BACKEND, onboardingStatus: 'SUCCESSFULLY' });
    vi.mocked(localStore.get).mockRejectedValue(new Error('storage corrupted'));
    const result = await handleGoogleAuth();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.keyMismatch).toBe(false);
  });
});
```

Note: the `chrome.identity.launchWebAuthFlow` and `apiClient.post` mocks above are placeholders. **Before running the failing tests, peek at the actual `handleGoogleAuth` function body to confirm what mocks it actually needs.** The function does the Google OAuth dance, posts to `/auth/login-with-google`, then gets `/auth/me`. The test only needs to mock these three things plus `localStore.get` and `localStore.set`. Adjust the mock implementations if the real OAuth flow uses a different chrome API.

- [ ] **Step 2: Run tests, verify they fail**

```bash
yarn test entrypoints/background/handlers/auth.handler.test.ts
```

Expected: all 9 tests fail because `keyMismatch` isn't in the response yet.

If tests fail due to missing OAuth mocks (e.g., undefined `chrome.identity` methods), adjust the test setup. If they fail due to import errors, those are the right kind of failure — proceed to Step 3.

- [ ] **Step 3: Implement the detection in `handleGoogleAuth`**

In `entrypoints/background/handlers/auth.handler.ts`, find the existing `handleGoogleAuth` body. After the `await sessionStore.set('partyStatus', partyStatus);` line (around line 129) and BEFORE the existing `onboardingComplete` line, add:

```ts
    // Detect keystore-vs-party-publicKey mismatch for already-onboarded users
    // who are signing in with a stale or wrong local keystore.
    // See: docs/superpowers/specs/2026-06-10-keystore-mismatch-recovery-design.md
    let keyMismatch = false;
    try {
      const existingKeystore = await localStore.get('keystore');
      if (
        partyStatus === 'SUCCESSFULLY' &&
        publicKey &&
        existingKeystore?.walletKey &&
        existingKeystore.walletKey !== publicKey
      ) {
        keyMismatch = true;
        console.warn('[Ginkgo] Keystore mismatch detected', {
          expected: publicKey.slice(0, 12) + '…',
          actual: existingKeystore.walletKey.slice(0, 12) + '…',
        });
      }
    } catch (e) {
      // Storage read failed — treat as no-mismatch (no regression vs. today's behavior)
      console.warn('[Ginkgo] Could not read keystore for mismatch check:', e);
    }
```

Then update the existing `return ok({ ... })` statement to include `keyMismatch`:

```ts
    return ok({
      token,
      user,
      partyId: partyId ?? '',
      partyStatus,
      publicKey,
      onboardingComplete,
      keyMismatch,        // ← NEW
    });
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
yarn test entrypoints/background/handlers/auth.handler.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Run full suite**

```bash
yarn test
```

Expected: 34 + 9 = 43 passing.

- [ ] **Step 6: typecheck**

```bash
yarn typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add entrypoints/background/handlers/auth.handler.ts \
        entrypoints/background/handlers/auth.handler.test.ts
git commit -m "feat(auth): detect keystore-vs-party-publicKey mismatch in handleGoogleAuth"
```

---

## Task 5: `ConfirmDeleteModal` component

**Why:** Reusable typed-confirmation modal for destructive actions. The first consumer is `KeyMismatch.tsx`'s wipe path (Task 6). Mirrors `TypedConfirm.tsx`'s localnet-prefill behavior for dev convenience.

**Files:**
- Create: `entrypoints/popup/pages/onboarding/ConfirmDeleteModal.tsx`

- [ ] **Step 1: Inspect `TypedConfirm.tsx` to copy its localnet-prefill pattern**

```bash
sed -n '1,30p' entrypoints/popup/pages/onboarding/TypedConfirm.tsx
```

Note how it uses `isLocalnet` to pre-fill the input. We'll mirror that pattern.

- [ ] **Step 2: Create the modal component**

`entrypoints/popup/pages/onboarding/ConfirmDeleteModal.tsx`:

```tsx
import { useState } from 'react';
import { AlertTriangleIcon, Loader2Icon, XIcon } from 'lucide-react';

interface Props {
  /** Body text shown above the typed-DELETE input — should describe what gets wiped. */
  body: string;
  /** True if the popup is running on the localnet network — pre-fills the input for dev convenience. */
  isLocalnet?: boolean;
  /** Error message to display under the input (e.g., from a failed background dispatch). */
  error?: string;
  /** True while the destructive action is running — disables the confirm button. */
  isLoading?: boolean;
  /** Called when the user clicks the confirm button (only enabled when input === "DELETE"). */
  onConfirm: () => void;
  /** Called when the user clicks the cancel button or the close (×) icon. */
  onCancel: () => void;
}

const CONFIRM_PHRASE = 'DELETE';

export function ConfirmDeleteModal({
  body,
  isLocalnet = false,
  error,
  isLoading = false,
  onConfirm,
  onCancel,
}: Props) {
  const [typed, setTyped] = useState(isLocalnet ? CONFIRM_PHRASE : '');
  const matches = typed.trim() === CONFIRM_PHRASE;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-background p-5 shadow-2xl">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="w-5 h-5 text-red-400" />
            <h2 className="text-base font-semibold text-foreground">Confirm Deletion</h2>
          </div>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="Close"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">{body}</p>

        <label className="block text-xs font-medium text-foreground mb-2">
          Type <span className="font-mono text-red-400">{CONFIRM_PHRASE}</span> to confirm:
        </label>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={isLoading}
          className="w-full rounded-lg border border-primary/20 bg-primary/5 text-foreground px-3 py-2 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-40"
          autoFocus
        />

        {error && (
          <div className="flex gap-3 rounded-xl bg-red-500/10 border border-red-500/30 p-3 mt-3">
            <AlertTriangleIcon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 rounded-xl border border-border bg-transparent py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!matches || isLoading}
            className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-40"
          >
            {isLoading ? <Loader2Icon className="w-4 h-4 animate-spin mx-auto" /> : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: typecheck**

```bash
yarn typecheck
```

Expected: pass. (Unused-import warnings are fine; eslint isn't installed.)

- [ ] **Step 4: Commit**

```bash
git add entrypoints/popup/pages/onboarding/ConfirmDeleteModal.tsx
git commit -m "feat(popup): add ConfirmDeleteModal — typed-DELETE confirmation"
```

---

## Task 6: `KeyMismatch` screen

**Why:** The new recovery screen. Renders the identity card and the two action buttons. Wires the `ConfirmDeleteModal` for the wipe path. Dispatches `MSG.RESET_KEYSTORE_FOR_RECOVERY` on confirm.

**Files:**
- Create: `entrypoints/popup/pages/onboarding/KeyMismatch.tsx`

- [ ] **Step 1: Create the screen**

`entrypoints/popup/pages/onboarding/KeyMismatch.tsx`:

```tsx
import { useState } from 'react';
import { AlertTriangleIcon, LogOutIcon, KeyRoundIcon, MailIcon, Link2Icon, GlobeIcon } from 'lucide-react';
import { sendMessage, MSG } from '@lib/messaging';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface Props {
  /** Email of the signed-in Google account. */
  email: string;
  /** Canton party identifier in `hint::fingerprint` form, e.g. "kairo-devnet::1220…30d". */
  partyId: string;
  /** Human-readable network label, e.g. "Localnet", "Devnet". */
  networkLabel: string;
  /** True if running on the localnet network — pre-fills the wipe-modal input for dev convenience. */
  isLocalnet: boolean;
  /** Called when the user clicks "Sign out". */
  onSignOut: () => void;
  /** Called after the wipe succeeds. Caller should clear keyMismatch state and navigate to create-password. */
  onWipeSuccess: () => void;
}

/** Truncate a long partyId for compact display: "kairo-devnet::1220…30d". */
function truncatePartyId(partyId: string): string {
  const sep = partyId.indexOf('::');
  if (sep < 0) return partyId;
  const hint = partyId.slice(0, sep);
  const fingerprint = partyId.slice(sep + 2);
  if (fingerprint.length <= 8) return partyId;
  return `${hint}::${fingerprint.slice(0, 4)}…${fingerprint.slice(-3)}`;
}

export function KeyMismatch({
  email,
  partyId,
  networkLabel,
  isLocalnet,
  onSignOut,
  onWipeSuccess,
}: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [wipeError, setWipeError] = useState('');
  const [wipeLoading, setWipeLoading] = useState(false);

  const handleWipeConfirm = async () => {
    setWipeError('');
    setWipeLoading(true);
    try {
      const res = await sendMessage({ action: MSG.RESET_KEYSTORE_FOR_RECOVERY });
      if (!res.ok) {
        setWipeError(res.error || 'Failed to reset keystore. Please try again.');
        return;
      }
      // Success: hand control back to App.tsx, which clears keyMismatch and navigates.
      onWipeSuccess();
    } catch (e: unknown) {
      setWipeError(e instanceof Error ? e.message : 'Failed to reset keystore. Please try again.');
    } finally {
      setWipeLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-6 bg-background">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangleIcon className="w-5 h-5 text-amber-400" />
        <h1 className="text-lg font-bold text-foreground">Wallet key mismatch</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Your local signing key doesn't match the public key registered for this account on the synchronizer.
      </p>

      <div className="rounded-xl border border-border/60 bg-secondary/40 p-3 mb-5 space-y-2">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <MailIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="truncate font-mono">{email}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Link2Icon className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="truncate font-mono">{truncatePartyId(partyId)}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-foreground">
          <GlobeIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          <span>{networkLabel}</span>
        </div>
      </div>

      <div className="space-y-3 mt-2 flex-1">
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 rounded-xl bg-secondary p-4 hover:bg-accent transition-colors text-left"
        >
          <div className="rounded-lg bg-primary/20 p-2.5">
            <LogOutIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">Sign out</p>
            <p className="text-xs text-muted-foreground">Use a different Google account.</p>
          </div>
        </button>

        <button
          onClick={() => setShowConfirm(true)}
          className="w-full flex items-center gap-3 rounded-xl bg-red-500/10 border border-red-500/30 p-4 hover:bg-red-500/15 transition-colors text-left"
        >
          <div className="rounded-lg bg-red-500/20 p-2.5">
            <KeyRoundIcon className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="font-medium text-foreground">Wipe local key and import the correct one</p>
            <p className="text-xs text-muted-foreground">
              Replace this device's signing key with the matching private key.
            </p>
          </div>
        </button>
      </div>

      {showConfirm && (
        <ConfirmDeleteModal
          body={`This will delete your local signing key for ${truncatePartyId(partyId)}. You'll need the correct private key to continue.`}
          isLocalnet={isLocalnet}
          error={wipeError}
          isLoading={wipeLoading}
          onConfirm={handleWipeConfirm}
          onCancel={() => {
            if (!wipeLoading) {
              setShowConfirm(false);
              setWipeError('');
            }
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

```bash
yarn typecheck
```

Expected: pass.

- [ ] **Step 3: Verify `sendMessage` typing accepts the new action**

Inspect the result by running:

```bash
yarn typecheck 2>&1 | grep -i "key-mismatch\|RESET_KEYSTORE_FOR_RECOVERY"
```

Expected: no output (no type errors related to the new action). If you see errors, Tasks 1–3 didn't wire the types correctly — backtrack.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/popup/pages/onboarding/KeyMismatch.tsx
git commit -m "feat(popup): add KeyMismatch screen with sign-out + wipe-and-import actions"
```

---

## Task 7: Wire `KeyMismatch` into `App.tsx`

**Why:** Final integration. Add `keyMismatch` state, route to the new screen, sync state from auth response, handle the wipe-success and sign-out callbacks.

**Files:**
- Modify: `entrypoints/popup/App.tsx`

- [ ] **Step 1: Add the new screen to the `Screen` union and import the component**

In `entrypoints/popup/App.tsx`, near the top imports (around line 13), add:

```ts
import { KeyMismatch } from './pages/onboarding/KeyMismatch';
```

In the `Screen` type union (around line 18-27), add `'key-mismatch'`:

```ts
type Screen =
  | 'loading'
  | 'welcome'
  | 'key-mismatch'        // ← NEW
  | 'create-password'
  | 'key-setup'
  | 'show-key'
  | 'acknowledgment'
  | 'typed-confirm'
  | 'unlock'
  | 'dashboard';
```

- [ ] **Step 2: Add the `keyMismatch` state**

After the `const [onboarding, ...]` line (around line 81), add:

```ts
  const [keyMismatch, setKeyMismatch] = useState(false);
  const [keyMismatchPartyId, setKeyMismatchPartyId] = useState('');
  const [keyMismatchEmail, setKeyMismatchEmail] = useState('');
```

- [ ] **Step 3: Add the routing check in the `useEffect`**

In the screen-selection `useEffect` (around line 88-117), add the `keyMismatch` branch **AFTER** `!isAuthenticated` and **BEFORE** the `unlocked` check:

```ts
  useEffect(() => {
    if (authLoading || lockLoading) {
      setScreen('loading');
      return;
    }

    if (!authState?.isAuthenticated) {
      setScreen('welcome');
      return;
    }

    // NEW: keystore mismatch detected at sign-in — force recovery flow
    if (keyMismatch) {
      setScreen('key-mismatch');
      return;
    }

    if (lockState?.unlocked) {
      setScreen('dashboard');
      return;
    }

    // Authenticated but locked — check if onboarding is done
    if (authState.onboardingComplete) {
      if (IS_ONBOARDING_TAB) {
        window.close();
        return;
      }
      setScreen('unlock');
    } else {
      setScreen('create-password');
    }
  }, [authState, lockState, authLoading, lockLoading, keyMismatch]);
```

Note the new `keyMismatch` in the dependency array.

- [ ] **Step 4: Update the `Welcome.onSuccess` callback**

Find the `case 'welcome':` block (around line 129-152). Replace its body with:

```tsx
      case 'welcome':
        return (
          <Welcome
            onSuccess={(data) => {
              // ALWAYS sync keyMismatch to the latest auth response.
              // Prevents stale state from a prior sign-in leaking into a fresh one.
              setKeyMismatch(!!data.keyMismatch);

              // FIRST check: mismatch takes precedence over onboardingComplete.
              if (data.keyMismatch) {
                setKeyMismatchPartyId(data.partyId);
                setKeyMismatchEmail(data.user.email);
                setOnboarding((prev) => ({
                  ...prev,
                  partyStatus: data.partyStatus,
                  existingPublicKey: data.publicKey,
                }));
                setScreen('key-mismatch');
                return;
              }

              if (data.onboardingComplete) {
                if (IS_ONBOARDING_TAB) {
                  window.close();
                  return;
                }
                setScreen('unlock');
              } else {
                setOnboarding((prev) => ({
                  ...prev,
                  partyStatus: data.partyStatus,
                  existingPublicKey: data.publicKey,
                }));
                setScreen('create-password');
              }
            }}
          />
        );
```

- [ ] **Step 5: Add the `renderScreen` case for `'key-mismatch'`**

In the `switch (screen)` block (after the `'welcome':` case, before `'create-password':`), add:

```tsx
      case 'key-mismatch':
        return (
          <KeyMismatch
            email={keyMismatchEmail}
            partyId={keyMismatchPartyId}
            networkLabel={network === 'localnet' ? 'Localnet' : network === 'devnet' ? 'Devnet' : network === 'testnet' ? 'Testnet' : 'Mainnet'}
            isLocalnet={isLocalnet}
            onSignOut={async () => {
              await sendMessage({ action: MSG.LOGOUT });
              setKeyMismatch(false);              // defensive — onSuccess will re-sync on next sign-in anyway
              clearOnboarding();
              setScreen('welcome');
            }}
            onWipeSuccess={() => {
              // Wipe committed in the background. Lift the routing gate and continue
              // through the existing-user onboarding flow. onboarding.existingPublicKey
              // and partyStatus were set in Welcome.onSuccess (step 4 above).
              setKeyMismatch(false);
              setScreen('create-password');
            }}
          />
        );
```

- [ ] **Step 6: Run typecheck + build**

```bash
yarn typecheck && yarn build
```

Expected: both exit 0. If typecheck errors mention missing `email` on `User`, verify the `User` type at `lib/types` includes `email` (it should, since `auth.handler.ts` already accesses `user.email`).

- [ ] **Step 7: Run full test suite**

```bash
yarn test
```

Expected: 43 still passing (no new tests in this task; behavior tested via manual smoke).

- [ ] **Step 8: Commit**

```bash
git add entrypoints/popup/App.tsx
git commit -m "feat(popup): route to KeyMismatch screen when handleGoogleAuth detects mismatch"
```

---

## Task 8: Manual smoke + quality bar

**Why:** Final verification before merge.

**Files:** none (verification only)

- [ ] **Step 1: Full quality bar**

```bash
yarn typecheck && yarn test && yarn build:all
```

Expected: all three exit 0. `yarn lint` is pre-existingly broken in this repo (eslint not installed); skip it.

- [ ] **Step 2: Load the extension in Chrome**

1. Build: `yarn build` (already done by build:all above; outputs to `build/chrome-mv3/`).
2. `chrome://extensions` → ensure Developer mode ON → Reload the Ginkgo card if previously loaded, or "Load unpacked" → `build/chrome-mv3/`.
3. Pin the extension. Open background DevTools (chrome://extensions → service worker link) and keep the Network panel + Console open.

- [ ] **Step 3: Confirm a working backend on localhost:3003**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3003/api/v0/dapp -H "Content-Type: application/json" -d '{}'
```

Expected: `401`. If anything else, check that `canton-exchange-backend` is up on `feat/CIP-0103_migration_phase2` with the `.env.devnet` configuration loaded.

- [ ] **Step 4: Manual smoke checklist**

Run these in order. Network = **Localnet**. Sign in as `kairo.dex01@gmail.com` (already-onboarded test user with partyId `kairo-devnet::1220275036…`).

**Setup the bad state:** to simulate the mismatch, open background DevTools → Application → Extension storage → `chrome.storage.local`. Find the `${network}:${userId}:keystore` key (for kairo.dex01). Edit the `walletKey` field to a different base64 string (anything not equal to the backend's `party.publicKey`). Save. Reload the popup.

  1. **Mismatch detected on sign-in:** Sign in as kairo.dex01. Expect: `KeyMismatch` screen appears with email `kairo.dex01@gmail.com`, the truncated party identity, and `Localnet`. Both action buttons visible. Background DevTools console: `[Ginkgo] Keystore mismatch detected { expected: '…', actual: '…' }`.

  2. **Sign out path:** Click "Sign out". Expect: returns to Welcome screen. The bad keystore is **still in chrome.storage.local** (verify in DevTools — not wiped).

  3. **Re-sign-in returns to mismatch screen:** Sign in again. Expect: `KeyMismatch` again.

  4. **Wipe modal — wrong text:** Click "Wipe local key and import the correct one". Modal appears. Type `wipe` or anything other than `DELETE`. The Delete button stays disabled.

  5. **Wipe modal — correct text:** Clear input, type `DELETE`. Delete button enables. Click Delete. Expect: modal closes, popup navigates to `CreatePassword`. Verify in chrome.storage.local that the keystore key is now `null` and `onboardingComplete` is `false`.

  6. **Re-import flow completes:** Enter a new password → Next. Lands on `KeySetup` with the amber "This account is already onboarded" banner (because `onboarding.existingPublicKey` is set). Paste **the correct private key** for kairo.dex01. Click "Import & Continue". The flow proceeds through `Acknowledgment` → `TypedConfirm` (type the `TYPO_TEXT` phrase or rely on localnet pre-fill) → completes. Lands on `Unlock`. Enter the new password. Lands on Dashboard.

  7. **Sign a transfer to verify the new keystore works:** From the dashboard or a connected dApp, trigger a transfer-offer/prepare → sign. The fingerprint check passes. No more "Key fingerprint mismatch" error.

  8. **No regression — correct keystore:** Sign out. (No need to re-corrupt — kairo.dex01's keystore now matches the backend.) Sign back in. Expect: straight to Unlock screen. **No** `KeyMismatch` screen.

  9. **No regression — fresh user on this device:** Sign out. Sign in with a different Google account that has never used this device. (You may need a second test account; if unavailable, simulate by clearing `chrome.storage.local` entirely.) Expect: standard `CreatePassword` → `KeySetup` onboarding flow. **No** `KeyMismatch` screen.

  10. **Background dispatch failure case (optional, harder to reproduce):** If you can trigger a `localStore.set` failure (e.g., by hitting a storage quota — unlikely in practice), the `ConfirmDeleteModal` should stay open with an inline error message and keystore should remain intact. Skip if you can't easily reproduce; the unit tests in Task 2 cover the error path.

  Record outcomes in the spec at `docs/superpowers/specs/2026-06-10-keystore-mismatch-recovery-design.md` §8 (or append a brief verification note to this plan).

- [ ] **Step 5: Confirm git state is clean**

```bash
git status
git log --oneline | head -10
```

Expected: no uncommitted changes; ~7 focused commits for this feature (Tasks 1–7 produced one commit each).

- [ ] **Step 6: (No commit — verification only)**

If any smoke item fails, file a follow-up commit on this branch with the fix and re-run.

---

## Wrap-up

Once all tasks complete and the manual smoke passes:

**Acceptance criteria (from spec §11):**
- [ ] All Vitest tests pass (43 expected: 31 prior + 12 new in this feature)
- [ ] Both extension builds clean (`yarn build:all`)
- [ ] Typecheck clean (`yarn typecheck`)
- [ ] Manual smoke items 1–9 from Task 8 Step 4 all pass
- [ ] `MSG.RESET_KEYSTORE_FOR_RECOVERY` is in `constants.ts` and routed in `background.ts`
- [ ] `GoogleAuthData.keyMismatch` is non-optional `boolean` in `lib/messaging/types.ts`
- [ ] `App.tsx` holds `keyMismatch` in React state and the routing `useEffect` checks it before `unlocked`/`onboardingComplete`
- [ ] `KeyMismatch.tsx` and `ConfirmDeleteModal.tsx` exist under `entrypoints/popup/pages/onboarding/`
- [ ] `handleResetKeystoreForRecovery` does NOT call `sessionStore.clear()` (verified by unit test)

**Follow-ups (out of scope for this PR, tracked in spec §12):**
- "Can't find your private key?" help text on the mismatch screen
- Expandable diagnostic panel (full publicKey vs walletKey side-by-side)
- Backend mismatch telemetry
- Detection on popup-open (in addition to sign-in)
