/**
 * Event broadcaster for CIP-0103 dApp API.
 *
 * Listens to chrome.storage changes for `unlocked` and `partyId` keys,
 * then broadcasts SPLICE_WALLET_EVENT messages to all tabs via
 * chrome.tabs.sendMessage. The content script relays these to the page.
 *
 * The StatusEvent shape is built by `buildStatusEvent()` in dapp-api.handler.ts
 * — same builder used by the `status` method — so the two paths cannot diverge.
 */
import { walletEvent } from '@lib/dapp-api/types';
import { buildDappAccount, buildStatusEvent } from './dapp-api.handler';

/**
 * Broadcast an event message to all open tabs.
 * Failures on individual tabs are silently ignored (tab may not have content script).
 */
async function broadcastToTabs(eventName: string, data: unknown): Promise<void> {
  const msg = walletEvent(eventName, data);
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {
          // Tab may not have content script loaded — ignore
        });
      }
    }
  } catch {
    // chrome.tabs API not available or no tabs — ignore
  }
}

/**
 * Set up the storage change listener for event broadcasting.
 * Call this once during background startup.
 */
export function setupEventBroadcaster(): void {
  chrome.storage.onChanged.addListener(
    async (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'session') {
        // `unlocked` changed → statusChanged + accountsChanged
        if ('unlocked' in changes) {
          const statusEvent = await buildStatusEvent();
          await broadcastToTabs('statusChanged', statusEvent);

          const account = await buildDappAccount();
          const accounts = account ? [account] : [];
          await broadcastToTabs('accountsChanged', accounts);
        }

        // `partyId` changed (without unlock change) → accountsChanged
        if ('partyId' in changes && !('unlocked' in changes)) {
          const account = await buildDappAccount();
          const accounts = account ? [account] : [];
          await broadcastToTabs('accountsChanged', accounts);
        }
      }

      // Network switch (stored in local storage as 'selectedNetwork')
      if (areaName === 'local' && 'selectedNetwork' in changes) {
        const statusEvent = await buildStatusEvent();
        await broadcastToTabs('statusChanged', statusEvent);

        const account = await buildDappAccount();
        const accounts = account ? [account] : [];
        await broadcastToTabs('accountsChanged', accounts);
      }
    },
  );
}
