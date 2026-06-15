import { useState } from 'react';
import { AlertTriangleIcon, LogOutIcon, KeyRoundIcon, MailIcon, Link2Icon, GlobeIcon } from 'lucide-react';
import { MSG } from '@lib/messaging';
import type { MessageResponse } from '@lib/messaging';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface Props {
  /** Email of the signed-in Google account. */
  email: string;
  /** Canton party identifier in `hint::fingerprint` form, e.g. "kairo-devnet::1220…30d". */
  partyId: string;
  /** Human-readable network label, e.g. "Localnet", "Devnet". */
  networkLabel: string;
  /** True if running on the localnet network — pre-fills the wipe-modal input for dev convenience. */
  isLocalnet: boolean;
  /** Called when the user clicks "Sign out". */
  onSignOut: () => void;
  /** Called after the wipe succeeds. Caller should clear keyMismatch state and navigate to create-password. */
  onWipeSuccess: () => void;
}

/** Truncate a long partyId for compact display: "kairo-devnet::1220…30d". */
function truncatePartyId(partyId: string): string {
  const sep = partyId.indexOf('::');
  if (sep < 0) return partyId;
  const hint = partyId.slice(0, sep);
  const fingerprint = partyId.slice(sep + 2);
  if (fingerprint.length <= 8) return partyId;
  return `${hint}::${fingerprint.slice(0, 4)}…${fingerprint.slice(-3)}`;
}

export function KeyMismatch({
  email,
  partyId,
  networkLabel,
  isLocalnet,
  onSignOut,
  onWipeSuccess,
}: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [wipeError, setWipeError] = useState('');
  const [wipeLoading, setWipeLoading] = useState(false);

  const handleWipeConfirm = async () => {
    setWipeError('');
    setWipeLoading(true);
    try {
      const res: MessageResponse<null> = await chrome.runtime.sendMessage({
        action: MSG.RESET_KEYSTORE_FOR_RECOVERY,
      });
      if (!res.success) {
        setWipeError(res.error || 'Failed to reset keystore. Please try again.');
        return;
      }
      // Success: hand control back to App.tsx, which clears keyMismatch and navigates.
      onWipeSuccess();
    } catch (e: unknown) {
      setWipeError(e instanceof Error ? e.message : 'Failed to reset keystore. Please try again.');
    } finally {
      setWipeLoading(false);
    }
  };

  return (
    <div className="bg-background flex h-full flex-col p-6">
      <div className="mb-1 flex items-center gap-2">
        <AlertTriangleIcon className="h-5 w-5 text-amber-400" />
        <h1 className="text-foreground text-lg font-bold">Wallet key mismatch</h1>
      </div>
      <p className="text-muted-foreground mb-4 text-sm">
        Your local signing key doesn't match the public key registered for this account on the synchronizer.
      </p>

      <div className="border-border/60 bg-secondary/40 mb-5 space-y-2 rounded-xl border p-3">
        <div className="text-foreground flex items-center gap-2 text-sm">
          <MailIcon className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="truncate font-mono">{email}</span>
        </div>
        <div className="text-foreground flex items-center gap-2 text-sm">
          <Link2Icon className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="truncate font-mono">{truncatePartyId(partyId)}</span>
        </div>
        <div className="text-foreground flex items-center gap-2 text-sm">
          <GlobeIcon className="text-muted-foreground h-4 w-4 shrink-0" />
          <span>{networkLabel}</span>
        </div>
      </div>

      <div className="mt-2 flex-1 space-y-3">
        <button
          onClick={onSignOut}
          className="bg-secondary hover:bg-accent flex w-full items-center gap-3 rounded-xl p-4 text-left transition-colors"
        >
          <div className="bg-primary/20 rounded-lg p-2.5">
            <LogOutIcon className="text-primary h-5 w-5" />
          </div>
          <div>
            <p className="text-foreground font-medium">Sign out</p>
            <p className="text-muted-foreground text-xs">Use a different Google account.</p>
          </div>
        </button>

        <button
          onClick={() => setShowConfirm(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-left transition-colors hover:bg-red-500/15"
        >
          <div className="rounded-lg bg-red-500/20 p-2.5">
            <KeyRoundIcon className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <p className="text-foreground font-medium">Wipe local key and import the correct one</p>
            <p className="text-muted-foreground text-xs">
              Replace this device's signing key with the matching private key.
            </p>
          </div>
        </button>
      </div>

      {showConfirm && (
        <ConfirmDeleteModal
          body={`This will delete your local signing key for ${truncatePartyId(partyId)}. You'll need the correct private key to continue.`}
          isLocalnet={isLocalnet}
          error={wipeError}
          isLoading={wipeLoading}
          onConfirm={handleWipeConfirm}
          onCancel={() => {
            if (!wipeLoading) {
              setShowConfirm(false);
              setWipeError('');
            }
          }}
        />
      )}
    </div>
  );
}
