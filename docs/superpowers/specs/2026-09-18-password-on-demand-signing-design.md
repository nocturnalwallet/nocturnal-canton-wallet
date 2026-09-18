# Password-on-Demand Signing & Inactivity-Only Auto-Lock — Design

**Date:** 2026-09-18
**Status:** Proposed (awaiting review)
**Branch target:** `universal-wallet`

## 1. Problem & motivation

Two coupled problems, discovered while investigating a "wallet re-locks after a few seconds" report:

1. **Re-lock bug.** The decrypted signing key is cached in a service-worker RAM variable (`_cachedPrivateKey`). Chrome tears down an idle MV3 service worker (~30s), wiping that RAM. Meanwhile `unlocked: true` persists in `chrome.storage.session`. `reconcileUnlockState()` (commit `4a75c8c`) treats "unlocked but no cached key" as "must lock," so the wallet re-locks on the next poll after every SW recycle. The 15-minute `AUTO_LOCK_MINUTES` timer is unrelated to the symptom.

2. **Weak/incoherent key handling.** The cached key lives for the whole 15-minute window in RAM, and the faucet path (`handleRequestFaucet`) prefers the cached key and only falls back to the typed password — so with a key cached, a **wrong password still succeeds** and the password field is misleading. dApp signing uses the cached key with **no password at all**.

### Goal

Adopt a **password-on-demand** signing model: the private key is never cached for general use. It is decrypted transiently for a single signing operation and discarded. Auto-lock becomes a **pure inactivity timeout** — the only thing that re-locks the wallet. A single, tightly-scoped exception exists for the one flow that genuinely cannot prompt for a password (silent auto-register of transfer pre-approval).

### Non-goals

- Replacing the Ed25519 signing primitive with a non-extractable WebCrypto `CryptoKey`. `@canton-network/core-signing-lib` takes the key as a raw string; a non-extractable key is a possible future hardening, out of scope here.
- Renewal/expiry of transfer pre-approvals.
- Any change to the CIP-0103 wire contract seen by dApps (signatures are still returned the same way).

## 2. Design overview

Four coordinated changes:

1. **Password-on-demand signing** for every user-initiated signing path (transfers, faucet, manual pre-approval registration, and dApp `signMessage`/`signTransaction`/`prepareExecute*`). Key is decrypted → fingerprint-verified → used → reference dropped.
2. **dApp approval popup gains a password field** with verify-on-approve, so dApp signing has a password to decrypt with.
3. **Scoped auto-register cache** — a dedicated, RAM-only, purpose-limited key cache that exists only from onboarding/unlock until the transfer pre-approval is confirmed, then cleared.
4. **Inactivity-only auto-lock** — delete `reconcileUnlockState`; the auto-lock alarm (and explicit lock/logout/network-switch) are the only things that set `unlocked = false`.

### Security posture

- The signing key exists in memory only for the duration of a single sign call, then its reference is dropped. It is **never** written to `chrome.storage.session`, never to disk, and never sent to the popup.
- The scoped auto-register key is RAM-only and cleared aggressively (see §5).
- Caveat (documented, accepted): JavaScript strings are immutable and garbage-collected non-deterministically, and the signing lib consumes a string, so we cannot guarantee zeroing the key bytes from memory — we minimize the window and drop references. A device-memory-scraping attacker is a threat to any JS wallet regardless; this design is strictly better than caching.

## 3. Component: password-on-demand signing

### 3.1 Shared helper

Extract the vetted decrypt→verify→sign path that already exists in `signing.handler.ts` (`decryptKey`, `verifyKeyFingerprint`, `verifyCurrentParty`, `signAndVerify`) into a shared module usable by both the popup signing handlers and the dApp handlers.

```
// entrypoints/background/signing/sign-with-password.ts (new)
async function signHashWithPassword(
  password: string,
  expectedPartyId: string | undefined,
  preparedTransactionHash: string,
): Promise<{ signature: string; publicKey: string }>
```

Behavior: load keystore → `provider.decryptKey(keystore, password)` (throws on wrong password) → derive public key → `verifyKeyFingerprint(publicKey, partyId)` → `signTransactionHash(hash, privateKey)` → return; the local `privateKey` reference goes out of scope immediately.

A raw-message variant `signMessageWithPassword(password, partyId, message)` wraps the CIP-0103 `signMessage` (Ed25519 over UTF-8 of the message).

### 3.2 Consumers

| Handler | Change |
|---|---|
| `signing.handler` transfer/approve/reject/withdraw | Already password-based; refactor to call the shared helper. No behavior change. |
| `api.handler` `handleRequestFaucet` | Remove the cached-key branch; **always** decrypt with the typed password (wrong password now fails, as the UI implies). |
| `keystore.handler` `handleRegisterTransferPreapproval` (manual) | Add a `password` param; decrypt on demand instead of `getCachedPrivateKey()`. UI gains a password prompt. |
| `dapp-api.handler` `handleSignMessage` / `handleSignTransaction` / `handlePrepareExecute` / `handlePrepareExecuteAndWait` | Replace `getCachedPrivateKey()` with the password from the approval result (see §4). |
| `dapp-api.handler` `buildDappAccount` | Stop deriving the public key from the private key; read the already-stored `keystore.walletKey`. Needs no key at all. |

`getCachedPrivateKey` / `setCachedPrivateKey` are removed from the general signing path. They survive only as the scoped auto-register cache API (§5), renamed for clarity (`getAutoRegisterKey` / `setAutoRegisterKey`).

## 4. Component: dApp approval password field

### 4.1 Round-trip changes

The approval infrastructure already blocks on a popup decision. Widen the result to carry a password.

- `lib/messaging/types.ts`: `DAPP_APPROVAL_RESULT` payload becomes `{ requestId: string; approved: boolean; password?: string }`. Add `MSG.VERIFY_PASSWORD` with payload `{ password: string }` → response `{ valid: boolean }`.
- `approval.handler.ts`: `requestApproval()` resolves to `{ approved: boolean; password?: string }`; `PendingApproval.resolve` and `resolveApproval(requestId, approved, password?)` updated; window-close handler resolves `{ approved: false }`.
- `background.ts`: `DAPP_APPROVAL_RESULT` case forwards the password to `resolveApproval`; new `VERIFY_PASSWORD` case → verify-only handler (see §4.3).

### 4.2 Popup UI (`DappApproval.tsx`)

- For **signing** methods (`signMessage`, `signTransaction`, `prepareExecute`, `prepareExecuteAndWait`): render a password input ("Password to sign").
- For **`connect`**: no password (connect establishes the session and returns the account; it does not sign).
- On **Approve** for a signing method: call `MSG.VERIFY_PASSWORD` first. If invalid → show "Invalid password" inline and keep the window open (do not resolve). If valid → send `DAPP_APPROVAL_RESULT { approved: true, password }`.
- Reject / window-close → `{ approved: false }` as today.

### 4.3 Verify-only handler

`handleVerifyPassword(password)`: load keystore → `provider.verifyPassword(keystore, password)` → return `{ valid }`. **No caching, no change to the `unlocked` flag.** This is distinct from `handleUnlock` (which sets session state).

### 4.4 dApp signing handlers

`handleSignMessage` / `handleSignTransaction` / `handlePrepareExecute*` receive the verified `password` (threaded from the generic gate at `dapp-api.handler.ts:~564` for `signMessage`/`signTransaction`, and from the inline `requestApproval` calls for `prepareExecute*`). They call the shared helper (§3.1) with that password. The prior `getCachedPrivateKey()` guard ("Signing key not loaded — please unlock") is removed; a bad password now surfaces as an `RpcError(UNAUTHORIZED)` (should not occur in practice because the popup verifies first).

The wallet-readiness gate (`isReady` = unlocked + onboarded) is **kept** for dApp requests — an auto-locked session still returns UNAUTHORIZED "unlock first," as today. The password is an additional factor, not a replacement for the session gate.

## 5. Component: scoped auto-register cache

The only flow that legitimately cannot prompt for a password: `handleMaybeAutoRegisterPreapproval` runs silently after onboarding, with no user present.

- **Storage:** a single RAM-only module variable (`_autoRegisterKey`), never `chrome.storage.session`, never disk.
- **Populate:** at onboarding-complete and at unlock, **only when** `shouldAutoRegisterPreapproval === true` **and** the account has not already recorded a successful registration. Otherwise never populated.
- **Consume:** `handleMaybeAutoRegisterPreapproval` uses it for its silent path (unchanged logic; if absent it returns `{ reason: 'locked' }` and retries next unlock — its existing graceful fallback).
- **Clear (primary):** as soon as the pre-approval status call returns a valid `TransferPreapproval` contractId.
- **Clear (backstops):** the auto-lock alarm, explicit lock, logout, network switch, and after any terminal auto-register outcome (success or give-up).
- Onboarding's own topology-transaction signing continues to use the in-flow key/password from the onboarding payload (not this cache).

## 6. Component: inactivity-only auto-lock

- **Delete `reconcileUnlockState`** and both call sites (`background.ts` startup; `handleGetLockState`). `handleGetLockState` returns the stored `unlocked` flag with no side effects.
- `unlocked` is a pure session flag in `chrome.storage.session` that survives SW restarts.
- The **only** setters of `unlocked = false`: the auto-lock alarm (`setupAutoLock` listener), `handleLock`, `handleLogout`, and network switch.
- `resetAutoLockTimer()` is unchanged: called on every non-read-only message; the read-only skip list in `routeMessage` (`GET_AUTH_STATE`, `GET_LOCK_STATE`, `GET_NETWORK`, `GET_ELFA_CHAT`, `GET_DAPP_APPROVAL`) does not reset it.
- `handleUnlock`: verify password, set `unlocked = true`, start the timer, optionally populate the scoped auto-register key (§5). **No general key caching.**
- The alarm is persistent and wakes the SW to fire, so the timeout is reliable across SW recycles.

### Accepted behavior (per decision)

Auto-lock is **pure inactivity timeout**, not screen-aware. When the 15-minute idle deadline is hit, the wallet locks globally regardless of the current screen (dashboard, a partly-filled form, etc.) and routes to Unlock. No softeners (no "popup-open counts as activity," no pre-lock warning, no mid-approval exemption). A pending dApp approval that outlives the lock still functions because it authenticates via its own password field, but the main popup shows locked.

## 7. Files touched

- `entrypoints/background/signing/sign-with-password.ts` — new shared helper.
- `entrypoints/background/handlers/session.handler.ts` — remove `reconcileUnlockState`, general cache; add scoped auto-register cache API; `handleUnlock` no longer caches; add `handleVerifyPassword`.
- `entrypoints/background/handlers/approval.handler.ts` — result carries password.
- `entrypoints/background/handlers/dapp-api.handler.ts` — thread password into signing handlers; `buildDappAccount` uses `keystore.walletKey`.
- `entrypoints/background/handlers/api.handler.ts` — faucet password-only.
- `entrypoints/background/handlers/keystore.handler.ts` — manual pre-approval takes password; onboarding populates scoped cache instead of general cache; auto-register consumes scoped cache + clears on confirmed contractId.
- `entrypoints/background.ts` — remove reconcile calls; add `VERIFY_PASSWORD` route; `DAPP_APPROVAL_RESULT` forwards password.
- `entrypoints/popup/pages/approval/DappApproval.tsx` — password field + verify-on-approve.
- `entrypoints/popup/pages/dashboard/TokenDetail.tsx` — faucet unchanged UI (already collects password); confirm it now truly gates.
- Manual pre-approval trigger UI (Settings/banner) — add password prompt.
- `lib/messaging/types.ts`, `lib/messaging/constants.ts` — `VERIFY_PASSWORD`, `DAPP_APPROVAL_RESULT` payload.

## 8. Testing strategy (TDD)

Write failing tests first for each unit:

- **`sign-with-password`**: valid password → signature; wrong password → throws; fingerprint mismatch → throws.
- **`session.handler`**: SW-restart simulation (`unlocked = true`, no key) → stays unlocked, no auto-lock (proves reconcile removal fixes the bug); alarm fires → `unlocked = false`; `handleGetLockState` returns the flag with no side effect; `handleVerifyPassword` valid/invalid; scoped cache populated only when auto-register pending, cleared on valid contractId and on lock/logout/network/alarm. Update existing `session.handler.test.ts` references to the removed general cache.
- **`approval.handler`**: `requestApproval` resolves `{ approved, password }`; window-close → `{ approved: false }`.
- **`dapp-api.handler`**: `signMessage`/`signTransaction`/`prepareExecute` sign using the provided password; not-approved → rejected; `buildDappAccount` returns the public key from `keystore.walletKey` while no key is cached.
- **faucet**: signs with the typed password; wrong password fails (no silent cached-key success).

Then implement to green; run `yarn typecheck && yarn lint && yarn test`; drive the dApp approval + transfer + faucet flows in a real build per `docs/testing-guide-nocturnal.md`.

## 9. Risks & migration

- **UX friction:** a password is required on every dApp approval and every signing action. Accepted trade-off (signing is the sensitive moment).
- **Auto-register degradation:** loses its "fire later, unattended" ability beyond the onboarding/unlock window; best-effort and rollout-gated, so acceptable.
- **Mid-form / pending-approval locks:** accepted per §6.
- **No storage migration:** the `unlocked` session flag is unchanged; existing users get the new behavior on next unlock. No keystore format change.
- **dApp compatibility:** the CIP-0103 API contract is unchanged; the extra password step is internal to the wallet popup.
