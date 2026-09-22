import type { ReactNode } from 'react';
import { Loader2Icon, AlertCircleIcon } from 'lucide-react';

/** Loading / error / empty scaffolding shared across the Elfa views. */
export function StateWrap({
  isLoading,
  error,
  isEmpty,
  emptyText,
  onRetry,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyText: string;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2Icon className="text-primary h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 px-4 text-center">
        <AlertCircleIcon className="text-destructive h-5 w-5" />
        <p className="text-destructive text-sm">
          {error instanceof Error ? error.message : 'Failed to load'}
        </p>
        <button onClick={onRetry} className="text-primary text-xs hover:underline">
          Retry
        </button>
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="flex h-40 items-center justify-center px-6 text-center">
        <p className="text-muted-foreground text-xs">{emptyText}</p>
      </div>
    );
  }
  return <>{children}</>;
}
