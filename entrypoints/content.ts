/**
 * CIP-0103 Content Script — Bridge between web page dApps and the extension background.
 *
 * This content script enables dApps using @canton-network/dapp-sdk to communicate
 * with the Nocturnal wallet extension. It relays messages between the page's
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
  CANTON_REQUEST_PROVIDER_EVENT,
  CANTON_ANNOUNCE_PROVIDER_EVENT,
  PROVIDER_NAME,
  type SpliceMessage,
} from '@lib/dapp-api/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',

  main() {
    // Routing key for multi-wallet pickers. dApps that want to address a
    // specific wallet set `target` on outbound messages to this value;
    // wallets ignore messages whose target doesn't match. EXT_ACK echoes
    // target back so the dApp can correlate which wallet replied.
    const runtimeId = chrome.runtime?.id;
    const shouldHandle = (target: string | undefined): boolean => {
      if (!target) return true;
      if (!runtimeId) return false;
      return target === runtimeId;
    };

    // Respond to provider-discovery requests with our identity. Mirrors
    // splice-wallet-kernel/wallet-gateway/extension/src/content-script.ts:20-31.
    // Fires every time the dApp's request event lands (the SDK may fire it
    // multiple times during a session); cheap and idempotent on the dApp side.
    if (runtimeId) {
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent(CANTON_ANNOUNCE_PROVIDER_EVENT, {
            detail: {
              id: runtimeId,
              name: PROVIDER_NAME,
              icon: chrome.runtime.getURL('icon/128.png'),
              target: runtimeId,
            },
          }),
        );
      window.addEventListener(CANTON_REQUEST_PROVIDER_EVENT, announce);
    }

    window.addEventListener('message', async (event: MessageEvent) => {
      const msg = event.data;
      if (!isSpliceMessage(msg)) return;

      // EXT_READY can come from the SDK's discovery popup (a different window),
      // so we must NOT restrict it to event.source === window.
      if (msg.type === WalletEvent.SPLICE_WALLET_EXT_READY) {
        if (!shouldHandle(msg.target)) return;
        window.postMessage(
          {
            type: WalletEvent.SPLICE_WALLET_EXT_ACK,
            target: msg.target ?? runtimeId,
          } satisfies SpliceMessage,
          '*',
        );
        return;
      }

      // All other messages must originate from the same window (not iframes etc.)
      if (event.source !== window) return;

      // Forward JSON-RPC requests to the background script
      if (msg.type === WalletEvent.SPLICE_WALLET_REQUEST) {
        if (!shouldHandle(msg.target)) return;
        try {
          const response = await chrome.runtime.sendMessage(msg);
          if (response && isSpliceMessage(response)) {
            window.postMessage(response, '*');
          }
        } catch (e) {
          // Extension context invalidated or background not available
          console.warn('[Nocturnal] Failed to relay message to background:', e);
        }
      }

      // Forward UI open requests to the background script
      if (msg.type === WalletEvent.SPLICE_WALLET_EXT_OPEN) {
        if (!shouldHandle(msg.target)) return;
        try {
          await chrome.runtime.sendMessage(msg);
        } catch {
          // ignore
        }
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
