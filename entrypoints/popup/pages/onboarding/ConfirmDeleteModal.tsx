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

  // Close the modal when the user clicks the backdrop (the dark area around the
  // modal card) — standard modal UX. The static <div> + onClick is intentional;
  // a <button> would steal focus on tab-nav, and adding a button role here
  // would semantically claim the backdrop is interactive content. The Cancel
  // and × buttons inside the modal still serve keyboard users for dismissal.
  return (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onCancel();
      }}
    >
      <div className="bg-background w-full max-w-sm rounded-2xl border border-red-500/30 p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="h-5 w-5 text-red-400" />
            <h2 className="text-foreground text-base font-semibold">Confirm Deletion</h2>
          </div>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="Close"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <p className="text-muted-foreground mb-4 text-sm">{body}</p>

        <label className="text-foreground mb-2 block text-xs font-medium">
          Type <span className="font-mono text-red-400">{CONFIRM_PHRASE}</span> to confirm:
        </label>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={isLoading}
          className="border-primary/20 bg-primary/5 text-foreground focus:border-primary focus:ring-primary w-full rounded-lg border px-3 py-2 font-mono text-sm outline-none focus:ring-1 disabled:opacity-40"
          // Typed-DELETE confirmation modal: the input is the only meaningful
          // control to interact with. Autofocus is the expected UX; users
          // expect to type 'DELETE' immediately on modal open.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />

        {error && (
          <div className="mt-3 flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
            <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="border-border text-foreground hover:bg-accent flex-1 rounded-xl border bg-transparent py-2.5 text-sm font-medium disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!matches || isLoading}
            className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-40"
          >
            {isLoading ? <Loader2Icon className="mx-auto h-4 w-4 animate-spin" /> : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
