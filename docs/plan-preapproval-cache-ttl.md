# Plan: Add TTL to Transfer Preapproval In-Memory Cache

## Context

The extension's `preapprovalRegisteredLocally` flag in the background service worker caches `true` forever once set. This means:
1. If a preapproval **expires on-chain**, the extension never detects it — the banner won't reappear.
2. On **logout**, the flag isn't cleared — a different user logging in sees stale status.

The fix: replace the boolean flag with a **timestamp-based TTL** (30 minutes). After expiry, the next `GET_PREAPPROVAL_STATUS` call re-queries dapp-core. Also clear the flag on logout/lock/network-switch.

## Changes

### 1. `entrypoints/background/handlers/keystore.handler.ts`

Replace the boolean flag with a timestamp:

```typescript
// Before
let preapprovalRegisteredLocally = false;

export function markPreapprovalRegistered(): void {
  preapprovalRegisteredLocally = true;
}

// After
const PREAPPROVAL_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let preapprovalCachedAt: number | null = null;

export function markPreapprovalRegistered(): void {
  preapprovalCachedAt = Date.now();
}

export function clearPreapprovalCache(): void {
  preapprovalCachedAt = null;
}

function isPreapprovalCacheValid(): boolean {
  return preapprovalCachedAt !== null && (Date.now() - preapprovalCachedAt) < PREAPPROVAL_CACHE_TTL_MS;
}
```

Update `handleGetPreapprovalStatus()`:
- Replace `if (preapprovalRegisteredLocally)` with `if (isPreapprovalCacheValid())`
- Replace `preapprovalRegisteredLocally = true` with `markPreapprovalRegistered()`

### 2. `entrypoints/background/handlers/auth.handler.ts`

Import and call `clearPreapprovalCache()` in the logout handler so the flag resets on sign-out.

### 3. `entrypoints/background/handlers/network.handler.ts`

Import and call `clearPreapprovalCache()` on network switch (network switch clears session, so preapproval status may differ per network).

### 4. Apply same changes to Canton Wallet

Mirror all changes in `/Users/lehoanganh/Working/FETCH/Angelhack/Canton/canton-wallet/` (same file paths).

## Files Modified

- `entrypoints/background/handlers/keystore.handler.ts` — TTL logic
- `entrypoints/background/handlers/auth.handler.ts` — clear on logout
- `entrypoints/background/handlers/network.handler.ts` — clear on network switch

## No UI Changes Needed

- The Balances banner already reacts to `hasPreapproval: false` — once the TTL expires and dapp-core reports the preapproval is gone, the banner reappears automatically.

## Verification

1. Register preapproval → banner disappears → verify no dapp-core HTTP call for 30 min
2. After 30 min (or by manually setting `PREAPPROVAL_CACHE_TTL_MS` to a short value like 10s for testing), switch tabs → verify the `status?partyId=...` HTTP call fires again
3. Logout → login as same/different user → verify the status is re-queried (not cached)
4. Switch network → verify status is re-queried
