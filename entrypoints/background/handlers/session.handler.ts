import { ok, err } from '@lib/messaging';
import type { MessageResponse, LockStateData } from '@lib/messaging';
import { localStore, sessionStore } from '@lib/storage';
import { AUTO_LOCK_MINUTES } from '@lib/constants';
import { getEncryptionProvider } from '../encryption';

const ALARM_NAME = 'auto-lock';

// In-memory cache for decrypted private key (cleared on lock/logout)
let _cachedPrivateKey: string | null = null;

export function setCachedPrivateKey(key: string | null): void {
  _cachedPrivateKey = key;
}

export function getCachedPrivateKey(): string | null {
  return _cachedPrivateKey;
}

export function setupAutoLock(): void {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
      _cachedPrivateKey = null;
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

    // Cache decrypted private key in memory for the session
    try {
      _cachedPrivateKey = await provider.decryptKey(keystore, password);
    } catch {
      // Non-critical — features like manual preapproval will need password fallback
    }

    await sessionStore.set('unlocked', true);
    resetAutoLockTimer();

    return ok({ unlocked: true });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Unlock failed');
  }
}

export async function handleLock(): Promise<MessageResponse<LockStateData>> {
  _cachedPrivateKey = null;
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
