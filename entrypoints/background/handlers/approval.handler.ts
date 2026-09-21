/**
 * dApp approval popup manager.
 *
 * Implements MetaMask-style user confirmation for sensitive dApp API calls.
 * Opens a popup window, waits for user approval/rejection, then resolves.
 */
import type { DappApprovalData } from '@lib/messaging/types';
import { createCenteredPopup } from '@lib/utils';

// Methods that require user approval before executing
export const APPROVAL_REQUIRED_METHODS = new Set([
  'connect',
  'signMessage',
  'signTransaction',
]);

interface PendingApproval {
  data: DappApprovalData;
  resolve: (result: { approved: boolean; password?: string }) => void;
  windowId?: number;
}

const pendingApprovals = new Map<string, PendingApproval>();

/**
 * Request user approval for a dApp API call.
 * Opens a popup window and returns a Promise that resolves when user decides.
 */
export async function requestApproval(
  method: string,
  origin: string,
  params?: unknown,
): Promise<{ approved: boolean; password?: string }> {
  const requestId = crypto.randomUUID();
  const data: DappApprovalData = { requestId, method, origin, params };

  return new Promise((resolve) => {
    pendingApprovals.set(requestId, { data, resolve });

    const popupUrl = chrome.runtime.getURL(
      `/popup.html?window=1&action=dapp-approve&id=${requestId}`,
    );

    createCenteredPopup(popupUrl, 400, 620)
      .then((win) => {
        const pending = pendingApprovals.get(requestId);
        if (pending && win?.id != null) {
          pending.windowId = win.id;
        }
      })
      .catch(() => {
        // Failed to open window — reject
        pendingApprovals.delete(requestId);
        resolve({ approved: false });
      });
  });
}

/**
 * Get the approval details for a given requestId.
 * Called by the popup to display what's being approved.
 */
export function getApprovalDetails(requestId: string): DappApprovalData | null {
  const pending = pendingApprovals.get(requestId);
  return pending?.data ?? null;
}

/**
 * Resolve a pending approval (called when user clicks Approve/Reject in popup).
 */
export function resolveApproval(requestId: string, approved: boolean, password?: string): void {
  const pending = pendingApprovals.get(requestId);
  if (!pending) return;

  pendingApprovals.delete(requestId);
  pending.resolve({ approved, password });
}

/**
 * Set up listener to auto-reject if the approval popup window is closed without action.
 * Call once during background startup.
 */
export function setupApprovalWindowListener(): void {
  chrome.windows.onRemoved.addListener((windowId) => {
    for (const [requestId, pending] of pendingApprovals) {
      if (pending.windowId === windowId) {
        pendingApprovals.delete(requestId);
        pending.resolve({ approved: false });
      }
    }
  });
}
