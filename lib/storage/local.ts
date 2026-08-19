import type { NetworkId } from '../network';
import { DEFAULT_NETWORK } from '../network';
import type { KeystoreData, SettingsData, StoredUser } from './schemas';

export interface LocalStorageSchema {
  keystore: KeystoreData | null;
  user: StoredUser | null;
  settings: SettingsData;
  onboardingComplete: boolean;
  /** Durable "this account already registered its transfer pre-approval" marker. */
  preapprovalRegistered: boolean;
}

const DEFAULTS: LocalStorageSchema = {
  keystore: null,
  user: null,
  settings: { autoLockMinutes: 15 },
  onboardingComplete: false,
  preapprovalRegistered: false,
};

const LOCAL_KEYS: (keyof LocalStorageSchema)[] = [
  'keystore',
  'user',
  'settings',
  'onboardingComplete',
  'preapprovalRegistered',
];

/** Keys that are scoped per-user (require userId in prefix). */
const USER_SCOPED_KEYS: readonly string[] = ['keystore', 'onboardingComplete', 'preapprovalRegistered'];

let _networkPrefix: NetworkId = DEFAULT_NETWORK;
let _userId: string | null = null;

export function setNetworkPrefix(network: NetworkId): void {
  _networkPrefix = network;
}

export function setUserScope(userId: string | null): void {
  _userId = userId;
}

function prefixKey(key: string): string {
  if (_userId && USER_SCOPED_KEYS.includes(key)) {
    return `${_networkPrefix}:${_userId}:${key}`;
  }
  return `${_networkPrefix}:${key}`;
}

export const localStore = {
  async get<K extends keyof LocalStorageSchema>(
    key: K,
  ): Promise<LocalStorageSchema[K]> {
    const pk = prefixKey(key);
    const result = await chrome.storage.local.get(pk);
    return (result[pk] as LocalStorageSchema[K]) ?? DEFAULTS[key];
  },

  async set<K extends keyof LocalStorageSchema>(
    key: K,
    value: LocalStorageSchema[K],
  ): Promise<void> {
    await chrome.storage.local.set({ [prefixKey(key)]: value });
  },

  async remove<K extends keyof LocalStorageSchema>(key: K): Promise<void> {
    await chrome.storage.local.remove(prefixKey(key));
  },

  /** Clear only keys belonging to the current network prefix. */
  async clear(): Promise<void> {
    const keys = LOCAL_KEYS.map((k) => prefixKey(k));
    await chrome.storage.local.remove(keys);
  },
};

/**
 * One-time migration: move unnamespaced keys to `devnet:*` prefix.
 * Call this once on background startup before any other storage access.
 */
export async function migrateUnprefixedData(): Promise<void> {
  const result = await chrome.storage.local.get('keystore');
  if (result.keystore === undefined) return; // No legacy data

  // Read all legacy keys
  const legacy = await chrome.storage.local.get(LOCAL_KEYS);

  // Copy to devnet-prefixed keys
  const prefixed: Record<string, unknown> = {};
  for (const key of LOCAL_KEYS) {
    if (legacy[key] !== undefined) {
      prefixed[`${DEFAULT_NETWORK}:${key}`] = legacy[key];
    }
  }

  // Write prefixed keys and remove legacy keys in one go
  await chrome.storage.local.set(prefixed);
  await chrome.storage.local.remove(LOCAL_KEYS as string[]);
}

/**
 * One-time migration: move network-only-scoped user data to per-user keys.
 * Moves `{network}:keystore` → `{network}:{userId}:keystore` (and onboardingComplete).
 * Call after migrateUnprefixedData and setNetworkPrefix.
 */
export async function migrateToUserScoped(): Promise<void> {
  const userKey = `${_networkPrefix}:user`;
  const result = await chrome.storage.local.get(userKey);
  const user = result[userKey] as StoredUser | undefined;
  if (!user?.id) return;

  // Check if old (non-user-scoped) keystore exists
  const oldKeystoreKey = `${_networkPrefix}:keystore`;
  const oldOnboardingKey = `${_networkPrefix}:onboardingComplete`;
  const oldData = await chrome.storage.local.get([oldKeystoreKey, oldOnboardingKey]);

  if (oldData[oldKeystoreKey] === undefined && oldData[oldOnboardingKey] === undefined) return;

  // Move to user-scoped keys
  const updates: Record<string, unknown> = {};
  const toRemove: string[] = [];

  if (oldData[oldKeystoreKey] !== undefined) {
    updates[`${_networkPrefix}:${user.id}:keystore`] = oldData[oldKeystoreKey];
    toRemove.push(oldKeystoreKey);
  }
  if (oldData[oldOnboardingKey] !== undefined) {
    updates[`${_networkPrefix}:${user.id}:onboardingComplete`] = oldData[oldOnboardingKey];
    toRemove.push(oldOnboardingKey);
  }

  await chrome.storage.local.set(updates);
  await chrome.storage.local.remove(toRemove);
}
