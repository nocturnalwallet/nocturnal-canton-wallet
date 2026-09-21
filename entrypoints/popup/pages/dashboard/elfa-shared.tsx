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

/** Parse the username (no `@`) from an x.com/<user>/status/<id> URL. */
export function handleFromUrl(link: string): string | null {
  try {
    const seg = new URL(link).pathname.split('/').filter(Boolean);
    return seg[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Return `link` only if it's a safe http(s) URL, else null. Elfa-sourced links
 * are third-party data rendered as <a href> in the privileged popup context, so
 * we reject non-http(s) schemes (javascript:, data:, …) before using them.
 */
export function safeExternalUrl(link: unknown): string | null {
  if (typeof link !== 'string') return null;
  try {
    const u = new URL(link);
    return u.protocol === 'http:' || u.protocol === 'https:' ? link : null;
  } catch {
    return null;
  }
}

/** Compact number formatting: 12578879 -> "12.6M". */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}
