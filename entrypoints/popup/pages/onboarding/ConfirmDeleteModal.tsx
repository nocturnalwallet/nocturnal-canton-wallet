import { useState } from 'react';
import { AlertTriangleIcon, Loader2Icon, XIcon } from 'lucide-react';

interface Props {
  /** Body text shown above the typed-DELETE input — should describe what gets wiped. */
  body: string;
  /** True if the popup is running on the localnet network — pre-fills the input for dev convenience. */
  isLocalnet?: boolean;
  /** Error message to display under the input (e.g., from a failed background dispatch). */
  error?: string;
  /** True while the destructive action is running — disables the confirm button. */
  isLoading?: boolean;
  /** Called when the user clicks the confirm button (only enabled when input === "DELETE"). */
  onConfirm: () => void;
  /** Called when the user clicks the cancel button or the close (×) icon. */
  onCancel: () => void;
}

const CONFIRM_PHRASE = 'DELETE';

export function ConfirmDeleteModal({
  body,
  isLocalnet = false,
  error,
  isLoading = false,
  onConfirm,
  onCancel,
}: Props) {
  const [typed, setTyped] = useState(isLocalnet ? CONFIRM_PHRASE : '');
  const matches = typed.trim() === CONFIRM_PHRASE;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-background p-5 shadow-2xl">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="w-5 h-5 text-red-400" />
            <h2 className="text-base font-semibold text-foreground">Confirm Deletion</h2>
          </div>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="Close"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">{body}</p>

        <label className="block text-xs font-medium text-foreground mb-2">
          Type <span className="font-mono text-red-400">{CONFIRM_PHRASE}</span> to confirm:
        </label>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={isLoading}
          className="w-full rounded-lg border border-primary/20 bg-primary/5 text-foreground px-3 py-2 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-40"
          autoFocus
        />

        {error && (
          <div className="flex gap-3 rounded-xl bg-red-500/10 border border-red-500/30 p-3 mt-3">
            <AlertTriangleIcon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 rounded-xl border border-border bg-transparent py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!matches || isLoading}
            className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-40"
          >
            {isLoading ? <Loader2Icon className="w-4 h-4 animate-spin mx-auto" /> : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
