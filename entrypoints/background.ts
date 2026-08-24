import { defineBackground } from 'wxt/utils/define-background';
import brand from '@brand/brand';
import { MSG } from '@lib/messaging';
import { ok, err } from '@lib/messaging/protocol';
import type { MessageRequest } from '@lib/messaging/types';
import { NETWORKS } from '@lib/network';
import { networkStore, localStore, setNetworkPrefix, setUserScope, migrateUnprefixedData, migrateToUserScoped } from '@lib/storage';

import {
  handleGoogleAuth,
  handleGetAuthState,
  handleRefreshToken,
  handleLogout,
} from './background/handlers/auth.handler';
import {
  setupAutoLock,
  resetAutoLockTimer,
  handleUnlock,
  handleLock,
  handleGetLockState,
} from './background/handlers/session.handler';
import {
  handleCreateKeypair,
  handleValidateImportKey,
  handlePrepareOnboarding,
  handleCompleteOnboarding,
  handleExportPrivateKey,
  handleDeleteKeystore,
  handleResetKeystoreForRecovery,
  handleRegisterTransferPreapproval,
  handleGetPreapprovalStatus,
  handleMaybeAutoRegisterPreapproval,
} from './background/handlers/keystore.handler';
import {
  handleSignAndSubmitTransferPreapproval,
  handleSignAndSubmitTransferTokenStandard,
  handleSignAndSubmitApprove,
  handleSignAndSubmitReject,
  handleSignAndSubmitWithdraw,
} from './background/handlers/signing.handler';
import {
  handleFetchBalances,
  handlePrepareTransferPreapproval,
  handlePrepareTransferTokenStandard,
  handleFetchIncomingOffers,
  handleFetchOutgoingOffers,
  handleFetchHistoryOffers,
  handlePrepareApprove,
  handlePrepareReject,

  handleFetchAboutMe,
  handleRequestFaucet,
  handlePrepareWithdraw,
  handleFetchElfaTrendingTokens,
  handleFetchElfaTokenNews,
  handleFetchElfaNarratives,
} from './background/handlers/api.handler';
import {
  handleGetNetwork,
  handleSwitchNetwork,
} from './background/handlers/network.handler';
import { setApiBaseUrl } from './background/api-client';
import { setGatewayFacadeBaseUrl } from './background/gateway-facade-client';
import { createCenteredPopup } from '@lib/utils';
import { isSpliceMessage, WalletEvent } from '@lib/dapp-api/types';
import { handleDappApiRequest } from './background/handlers/dapp-api.handler';
import { setupEventBroadcaster } from './background/handlers/event-broadcaster';
import {
  getApprovalDetails,
  resolveApproval,
  setupApprovalWindowListener,
} from './background/handlers/approval.handler';

export default defineBackground(() => {
  console.log(`${brand.logTag} Background service worker started`);

  // Initialize network: migrate legacy data, set prefix & API URL, set user scope
  (async () => {
    await migrateUnprefixedData();
    const network = await networkStore.get();
    setNetworkPrefix(network);
    setApiBaseUrl(NETWORKS[network].apiBaseUrl);
    setGatewayFacadeBaseUrl(NETWORKS[network].apiBaseUrl);

    // Migrate existing keystore/onboardingComplete to per-user keys
    await migrateToUserScoped();

    // Restore user scope from last logged-in user on this network
    const user = await localStore.get('user');
    if (user?.id) {
      setUserScope(user.id);
    }
  })();

  // Set up auto-lock alarm listener
  setupAutoLock();

  // Set up event broadcaster for dApp API (statusChanged, accountsChanged)
  setupEventBroadcaster();

  // Set up approval popup window close listener (auto-reject on close)
  setupApprovalWindowListener();

  // CIP-0103 dApp API message handler (from content script)
  // This handles SpliceMessage format from web pages via the content script bridge.
  // It must be registered BEFORE the internal handler to intercept dApp messages.
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isSpliceMessage(message)) return false; // Not a SpliceMessage — let other listeners handle it

    if (message.type === WalletEvent.SPLICE_WALLET_REQUEST) {
      const senderOrigin = sender.origin || (sender.tab?.url ? new URL(sender.tab.url).origin : undefined);
      handleDappApiRequest(message, senderOrigin)
        .then(sendResponse)
        .catch(() => sendResponse(null));
      return true; // Async response
    }

    if (message.type === WalletEvent.SPLICE_WALLET_EXT_OPEN) {
      createCenteredPopup(message.url, 400, 600);
      sendResponse(null);
      return false;
    }

    return false;
  });

  // Main message router (existing popup ↔ background communication)
  chrome.runtime.onMessage.addListener((message: MessageRequest, _sender, sendResponse) => {
    if (isSpliceMessage(message)) return false; // Already handled by CIP-0103 listener above
    const handler = routeMessage(message);
    handler.then(sendResponse).catch((e) => sendResponse(err(String(e))));
    return true; // Keep message channel open for async response
  });
});

async function routeMessage(message: MessageRequest) {
  // Reset auto-lock timer on user activity (skip read-only state checks)
  const skipReset = [MSG.GET_AUTH_STATE, MSG.GET_LOCK_STATE, MSG.GET_NETWORK, MSG.GET_DAPP_APPROVAL];
  if (!skipReset.includes(message.action as (typeof skipReset)[number])) {
    resetAutoLockTimer();
  }

  switch (message.action) {
    // Auth
    case MSG.GOOGLE_AUTH:
      return handleGoogleAuth();
    case MSG.GET_AUTH_STATE:
      return handleGetAuthState();
    case MSG.REFRESH_TOKEN:
      return handleRefreshToken();
    case MSG.LOGOUT:
      return handleLogout();

    // Network
    case MSG.GET_NETWORK:
      return handleGetNetwork();
    case MSG.SWITCH_NETWORK:
      return handleSwitchNetwork(message.payload.network);

    // Session
    case MSG.UNLOCK:
      return handleUnlock(message.payload.password);
    case MSG.LOCK:
      return handleLock();
    case MSG.GET_LOCK_STATE:
      return handleGetLockState();

    // Keystore
    case MSG.CREATE_KEYPAIR:
      return handleCreateKeypair();
    case MSG.VALIDATE_IMPORT_KEY:
      return handleValidateImportKey(message.payload.privateKey, message.payload.expectedPublicKey);
    case MSG.PREPARE_ONBOARDING:
      return handlePrepareOnboarding(message.payload.publicKey);
    case MSG.COMPLETE_ONBOARDING:
      return handleCompleteOnboarding(message.payload);
    case MSG.EXPORT_PRIVATE_KEY:
      return handleExportPrivateKey(message.payload.password);
    case MSG.DELETE_KEYSTORE:
      return handleDeleteKeystore();
    case MSG.RESET_KEYSTORE_FOR_RECOVERY:
      return handleResetKeystoreForRecovery();

    // Transfer pre-approval
    case MSG.REGISTER_TRANSFER_PREAPPROVAL:
      return handleRegisterTransferPreapproval();
    case MSG.GET_PREAPPROVAL_STATUS:
      return handleGetPreapprovalStatus();
    case MSG.MAYBE_AUTO_REGISTER_PREAPPROVAL:
      return handleMaybeAutoRegisterPreapproval();

    // Signing
    case MSG.SIGN_AND_SUBMIT_TRANSFER_PREAPPROVAL:
      return handleSignAndSubmitTransferPreapproval(message.payload);
    case MSG.SIGN_AND_SUBMIT_TRANSFER_TOKEN_STANDARD:
      return handleSignAndSubmitTransferTokenStandard(message.payload);
    case MSG.SIGN_AND_SUBMIT_APPROVE:
      return handleSignAndSubmitApprove(message.payload);
    case MSG.SIGN_AND_SUBMIT_REJECT:
      return handleSignAndSubmitReject(message.payload);
    case MSG.SIGN_AND_SUBMIT_WITHDRAW:
      return handleSignAndSubmitWithdraw(message.payload);

    // API proxy
    case MSG.FETCH_BALANCES:
      return handleFetchBalances();
    case MSG.PREPARE_TRANSFER_PREAPPROVAL:
      return handlePrepareTransferPreapproval(message.payload);
    case MSG.PREPARE_TRANSFER_TOKEN_STANDARD:
      return handlePrepareTransferTokenStandard(message.payload);
    case MSG.FETCH_INCOMING_OFFERS:
      return handleFetchIncomingOffers(message.payload);
    case MSG.FETCH_OUTGOING_OFFERS:
      return handleFetchOutgoingOffers(message.payload);
    case MSG.FETCH_HISTORY_OFFERS:
      return handleFetchHistoryOffers(message.payload);
    case MSG.PREPARE_APPROVE:
      return handlePrepareApprove(message.payload);
    case MSG.PREPARE_REJECT:
      return handlePrepareReject(message.payload);
    case MSG.PREPARE_WITHDRAW:
      return handlePrepareWithdraw(message.payload);

case MSG.FETCH_ABOUT_ME:
      return handleFetchAboutMe();
    case MSG.REQUEST_FAUCET:
      return handleRequestFaucet(message.payload.password, message.payload.amount);
    case MSG.FETCH_ELFA_TRENDING_TOKENS:
      return handleFetchElfaTrendingTokens(message.payload.window);
    case MSG.FETCH_ELFA_TOKEN_NEWS:
      return handleFetchElfaTokenNews(message.payload.window);
    case MSG.FETCH_ELFA_NARRATIVES:
      return handleFetchElfaNarratives(message.payload.window);

    // dApp approval flow
    case MSG.GET_DAPP_APPROVAL: {
      const details = getApprovalDetails(message.payload.requestId);
      return details ? ok(details) : err('Approval request not found');
    }
    case MSG.DAPP_APPROVAL_RESULT: {
      resolveApproval(message.payload.requestId, message.payload.approved);
      return ok(null);
    }

    default:
      return err(`Unknown action: ${(message as { action: string }).action}`);
  }
}
