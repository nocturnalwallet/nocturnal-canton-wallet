import { ok, err } from '@lib/messaging';
import type { MessageResponse, LockStateData } from '@lib/messaging';
import { localStore, sessionStore, networkStore } from '@lib/storage';
import { NETWORKS } from '@lib/network';
import { AUTO_LOCK_MINUTES } from '@lib/constants';
import { getEncryptionProvider } from '../encryption';
import { signingRelay } from '../signing-relay/relay-client';

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

    // Connect to signing relay if configured for this network
    connectSigningRelay();

    return ok({ unlocked: true });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Unlock failed');
  }
}

export async function handleLock(): Promise<MessageResponse<LockStateData>> {
  _cachedPrivateKey = null;
  signingRelay.disconnect();
  await sessionStore.set('unlocked', false);
  chrome.alarms.clear(ALARM_NAME);
  return ok({ unlocked: false });
}

export async function handleGetLockState(): Promise<MessageResponse<LockStateData>> {
  const unlocked = await sessionStore.get('unlocked');
  return ok({ unlocked });
}

/** Connect to signing relay with current party's keys. Fire-and-forget. */
export async function connectSigningRelay(): Promise<void> {
  try {
    const partyId = await sessionStore.get('partyId');
    const networkId = await networkStore.get();
    const config = NETWORKS[networkId];

    if (!partyId || !config.signingRelayUrl) return;

    const authToken = await sessionStore.get('authToken');
    signingRelay.disconnect(); // clean up any existing connection first
    signingRelay.connect(config.signingRelayUrl, partyId, {
      authToken: authToken ?? undefined,
      apiKey: config.signingRelayApiKey || undefined,
    });

    // Register the party's public key with the relay
    if (_cachedPrivateKey) {
      const { getPublicKeyFromPrivate } = await import('@canton-network/core-signing-lib');
      const publicKey = getPublicKeyFromPrivate(_cachedPrivateKey);
      const [hint, fingerprint] = partyId.split('::');
      signingRelay.registerKeys([{ id: fingerprint, name: hint, publicKey }]);
    }
  } catch (e) {
    console.warn('[Ginkgo] Failed to connect signing relay:', e);
  }
}

/**
 * Connect to signing relay during onboarding (before partyId exists).
 * Registers the key with a generic name so the relay can forward signing requests.
 */
export async function connectSigningRelayForOnboarding(privateKey: string): Promise<void> {
  try {
    const networkId = await networkStore.get();
    const config = NETWORKS[networkId];

    if (!config.signingRelayUrl) return;

    const authToken = await sessionStore.get('authToken');
    signingRelay.disconnect(); // clean up any existing connection first
    signingRelay.connect(config.signingRelayUrl, 'onboarding', {
      authToken: authToken ?? undefined,
      apiKey: config.signingRelayApiKey || undefined,
    });

    const { getPublicKeyFromPrivate } = await import('@canton-network/core-signing-lib');
    const publicKey = getPublicKeyFromPrivate(privateKey);

    // Wait briefly for the socket connection to establish before registering keys
    await new Promise<void>((resolve) => {
      const check = () => {
        if (signingRelay.isConnected) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      // Timeout after 5 seconds
      setTimeout(resolve, 5000);
      check();
    });

    signingRelay.registerKeys([{ id: 'onboarding', name: 'onboarding', publicKey }]);
  } catch (e) {
    console.warn('[Ginkgo] Failed to connect signing relay for onboarding:', e);
  }
}
