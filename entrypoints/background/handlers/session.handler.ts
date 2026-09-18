import { ok, err } from '@lib/messaging';
import type { MessageResponse, LockStateData } from '@lib/messaging';
import { localStore, sessionStore } from '@lib/storage';
import { AUTO_LOCK_MINUTES } from '@lib/constants';
import { getEncryptionProvider } from '../encryption';

const ALARM_NAME = 'auto-lock';

// RAM-only key used ONLY by the silent transfer-preapproval auto-register flow
// (`handleMaybeAutoRegisterPreapproval`), which runs unattended and therefore
// cannot prompt for a password. It is populated at unlock/onboarding — and only
// when auto-register is actually pending — and cleared on lock/logout/network
// switch and once the preapproval is confirmed. It never leaves the service
// worker's memory (never persisted to chrome.storage/disk, never sent to the popup).
let _autoRegisterKey: string | null = null;

export function setAutoRegisterKey(key: string | null): void {
  _autoRegisterKey = key;
}

export function getAutoRegisterKey(): string | null {
  return _autoRegisterKey;
}

export function clearAutoRegisterKey(): void {
  _autoRegisterKey = null;
}

/**
 * Store the key in the scoped auto-register cache ONLY when a transfer
 * preapproval auto-registration is pending for this session; otherwise no-op.
 */
export async function maybeCacheAutoRegisterKey(privateKey: string): Promise<void> {
  if (await sessionStore.get('shouldAutoRegisterPreapproval')) {
    _autoRegisterKey = privateKey;
  }
}

export function setupAutoLock(): void {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
      _autoRegisterKey = null;
      await sessionStore.set('unlocked', false);
    }
  });
}

export function resetAutoLockTimer(): void {
  chrome.alarms.create(ALARM_NAME, { delayInMinutes: AUTO_LOCK_MINUTES });
  sessionStore.touchActivity();
}

export async function handleUnlock(
  password: string,
): Promise<MessageResponse<LockStateData>> {
  try {
    const keystore = await localStore.get('keystore');
    if (!keystore) return err('No keystore found');

    const provider = await getEncryptionProvider();
    const valid = await provider.verifyPassword(keystore, password);
    if (!valid) return err('Invalid password');

    // No general key caching — signing is password-on-demand everywhere.
    // Populate the scoped RAM key ONLY when a silent auto-register is pending
    // (maybeCacheAutoRegisterKey no-ops otherwise); the decrypted key is dropped
    // immediately afterward and never otherwise retained.
    try {
      const privateKey = await provider.decryptKey(keystore, password);
      await maybeCacheAutoRegisterKey(privateKey);
    } catch {
      // Non-critical — auto-register simply skips (locked) if the key isn't cached.
    }

    await sessionStore.set('unlocked', true);
    resetAutoLockTimer();

    return ok({ unlocked: true });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Unlock failed');
  }
}

export async function handleLock(): Promise<MessageResponse<LockStateData>> {
  _autoRegisterKey = null;
  await sessionStore.set('unlocked', false);
  chrome.alarms.clear(ALARM_NAME);
  return ok({ unlocked: false });
}

export async function handleGetLockState(): Promise<MessageResponse<LockStateData>> {
  return ok({ unlocked: await sessionStore.get('unlocked') });
}

/**
 * Verify-only password check. Does NOT cache the private key and does NOT
 * touch the `unlocked` session flag — used by flows (e.g. dApp approval)
 * that need to confirm the password without unlocking the wallet.
 */
export async function handleVerifyPassword(
  password: string,
): Promise<MessageResponse<{ valid: boolean }>> {
  const keystore = await localStore.get('keystore');
  if (!keystore) return ok({ valid: false });
  const provider = await getEncryptionProvider();
  return ok({ valid: await provider.verifyPassword(keystore, password) });
}
