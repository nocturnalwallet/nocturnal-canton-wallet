import { DEFAULT_NETWORK, NETWORK_IDS, type NetworkId } from '../network';

const NETWORK_KEY = 'selectedNetwork';

/** Global (non-namespaced) store for the active network selection. */
export const networkStore = {
  async get(): Promise<NetworkId> {
    const result = await chrome.storage.local.get(NETWORK_KEY);
    const stored = result[NETWORK_KEY] as NetworkId | undefined;
    // Fall back to DEFAULT_NETWORK when unset, or when a previously-stored
    // network isn't available in this build (e.g. a stale 'devnet' selection
    // in a Mainnet-only production build).
    return stored && NETWORK_IDS.includes(stored) ? stored : DEFAULT_NETWORK;
  },

  async set(network: NetworkId): Promise<void> {
    await chrome.storage.local.set({ [NETWORK_KEY]: network });
  },
};
