/**
 * CIP-0103 Content Script — Bridge between web page dApps and the extension background.
 *
 * This content script enables dApps using @canton-network/dapp-sdk to communicate
 * with the Ginkgo wallet extension. It relays messages between the page's
 * window.postMessage channel and chrome.runtime.sendMessage.
 *
 * Message flow:
 *   dApp (window.postMessage) → content script → chrome.runtime.sendMessage → background
 *   background (sendResponse) → content script → window.postMessage → dApp
 */
import { defineContentScript } from 'wxt/utils/define-content-script';
import {
  isSpliceMessage,
  WalletEvent,
  type SpliceMessage,
} from '@lib/dapp-api/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',

  main() {
    window.addEventListener('message', async (event: MessageEvent) => {
      // Only handle messages from the same window (not from iframes etc.)
      if (event.source !== window) return;

      const msg = event.data;
      if (!isSpliceMessage(msg)) return;

      // Forward JSON-RPC requests to the background script
      if (msg.type === WalletEvent.SPLICE_WALLET_REQUEST) {
        try {
          const response = await chrome.runtime.sendMessage(msg);
          if (response && isSpliceMessage(response)) {
            window.postMessage(response, '*');
          }
        } catch (e) {
          // Extension context invalidated or background not available
          console.warn('[Ginkgo] Failed to relay message to background:', e);
        }
      }

      // Forward UI open requests to the background script
      if (msg.type === WalletEvent.SPLICE_WALLET_EXT_OPEN) {
        try {
          await chrome.runtime.sendMessage(msg);
        } catch {
          // ignore
        }
      }

      // Acknowledge extension readiness probe from dApp SDK
      if (msg.type === WalletEvent.SPLICE_WALLET_EXT_READY) {
        window.postMessage(
          { type: WalletEvent.SPLICE_WALLET_EXT_ACK } satisfies SpliceMessage,
          '*',
        );
      }
    });

    // Listen for background-initiated event messages and forward to the page.
    // This enables push events (statusChanged, accountsChanged) to reach the dApp.
    chrome.runtime.onMessage.addListener((message: unknown) => {
      if (!isSpliceMessage(message)) return;
      if (message.type === WalletEvent.SPLICE_WALLET_EVENT) {
        window.postMessage(message, '*');
      }
    });
  },
});
