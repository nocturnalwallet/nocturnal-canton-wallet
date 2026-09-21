import { ok, err } from '@lib/messaging';
import type { MessageResponse, NetworkData } from '@lib/messaging';
import { NETWORKS, NETWORK_IDS, type NetworkId } from '@lib/network';
import { networkStore, sessionStore, setNetworkPrefix, setUserScope } from '@lib/storage';
import { setApiBaseUrl } from '../api-client';
import { setGatewayFacadeBaseUrl } from '../gateway-facade-client';
import { clearAutoRegisterKey } from './session.handler';
import { clearPreapprovalCache } from './keystore.handler';

export async function handleGetNetwork(): Promise<MessageResponse<NetworkData>> {
  try {
    const network = await networkStore.get();
    return ok({ network, config: NETWORKS[network] });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Failed to get network');
  }
}

export async function handleSwitchNetwork(
  network: NetworkId,
): Promise<MessageResponse<NetworkData>> {
  try {
    // Clear the scoped auto-register key and preapproval cache
    clearAutoRegisterKey();
    clearPreapprovalCache();

    if (!NETWORK_IDS.includes(network)) {
      return err(`Invalid network: ${network}`);
    }

    // Persist the selection
    await networkStore.set(network);

    // Update local storage namespace
    setNetworkPrefix(network);

    // Update API client base URLs (REST + JSON-RPC facade share the same base)
    setApiBaseUrl(NETWORKS[network].apiBaseUrl);
    setGatewayFacadeBaseUrl(NETWORKS[network].apiBaseUrl);

    // Clear session — auth tokens are network-specific
    await sessionStore.clear();

    // Reset user scope — will be re-set on next login
    setUserScope(null);

    return ok({ network, config: NETWORKS[network] });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Failed to switch network');
  }
}
