// Non-component helpers shared across the Elfa dashboard views. Kept in a plain
// `.ts` module (separate from elfa-shared.tsx's StateWrap component) so React
// Fast Refresh stays happy — a .tsx should only export components.

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
