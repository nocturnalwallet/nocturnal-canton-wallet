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
    <div className="flex flex-col h-full p-6 bg-background">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangleIcon className="w-5 h-5 text-amber-400" />
        <h1 className="text-lg font-bold text-foreground">Wallet key mismatch</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Your local signing key doesn't match the public key registered for this account on the synchronizer.
      </p>

      <div className="rounded-xl border border-border/60 bg-secondary/40 p-3 mb-5 space-y-2">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <MailIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="truncate font-mono">{email}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Link2Icon className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="truncate font-mono">{truncatePartyId(partyId)}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-foreground">
          <GlobeIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          <span>{networkLabel}</span>
        </div>
      </div>

      <div className="space-y-3 mt-2 flex-1">
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 rounded-xl bg-secondary p-4 hover:bg-accent transition-colors text-left"
        >
          <div className="rounded-lg bg-primary/20 p-2.5">
            <LogOutIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">Sign out</p>
            <p className="text-xs text-muted-foreground">Use a different Google account.</p>
          </div>
        </button>

        <button
          onClick={() => setShowConfirm(true)}
          className="w-full flex items-center gap-3 rounded-xl bg-red-500/10 border border-red-500/30 p-4 hover:bg-red-500/15 transition-colors text-left"
        >
          <div className="rounded-lg bg-red-500/20 p-2.5">
            <KeyRoundIcon className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="font-medium text-foreground">Wipe local key and import the correct one</p>
            <p className="text-xs text-muted-foreground">
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
