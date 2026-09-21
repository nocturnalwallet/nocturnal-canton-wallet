import { useState } from 'react';
import { ExternalLinkIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import type { ElfaMention } from '@lib/messaging';
import { useElfaSmartStats } from '../../hooks/useElfa';
import { handleFromUrl, compactNumber, safeExternalUrl } from './elfa-shared';

/**
 * A single social-mention row, shared by News, token drill-down, and Search.
 * Tapping the chevron lazily loads the author's Elfa smart-stats (credibility);
 * the hook caches 30 min so repeat taps on the same handle cost no credits.
 */
export function ElfaMentionRow({ mention }: { mention: ElfaMention }) {
  const [open, setOpen] = useState(false);
  const handle = mention.account?.username ?? handleFromUrl(mention.link);
  const safeLink = safeExternalUrl(mention.link);
  const stats = useElfaSmartStats(handle ?? '', open);

  const when = new Date(mention.mentionedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="bg-primary/5 border-primary/10 overflow-hidden rounded-xl border">
      <div className="flex items-center gap-2 p-3">
        <a
          href={safeLink ?? undefined}
          target={safeLink ? '_blank' : undefined}
          rel="noreferrer"
          className="min-w-0 flex-1"
          aria-disabled={safeLink ? undefined : true}
        >
          <p className="text-foreground truncate text-sm font-medium">
            {handle ? `@${handle}` : 'View post'}
          </p>
          <p className="text-muted-foreground text-xs">
            {when}
            {typeof mention.viewCount === 'number'
              ? ` · ${compactNumber(mention.viewCount)} views`
              : ''}
          </p>
        </a>
        {handle && (
          <button
            onClick={() => setOpen((o) => !o)}
            title="Account credibility"
            className="text-muted-foreground hover:text-primary shrink-0 rounded p-1 transition-colors"
          >
            {open ? (
              <ChevronUpIcon className="h-4 w-4" />
            ) : (
              <ChevronDownIcon className="h-4 w-4" />
            )}
          </button>
        )}
        {safeLink && (
          <a
            href={safeLink}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-primary shrink-0 rounded p-1 transition-colors"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {open && handle && (
        <div className="border-primary/10 border-t px-3 py-2">
          {stats.isLoading ? (
            <p className="text-muted-foreground text-xs">Checking credibility…</p>
          ) : stats.error || !stats.data ? (
            <p className="text-muted-foreground text-xs">Credibility unavailable</p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <Stat label="Smart followers" value={compactNumber(stats.data.smartFollowerCount)} />
              <Stat label="Avg reach" value={compactNumber(stats.data.averageReach)} />
              <Stat label="Followers" value={compactNumber(stats.data.followerCount)} />
              <Stat
                label="Engagement"
                value={`${(stats.data.averageEngagement * 100).toFixed(1)}%`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-muted-foreground">
      {label}:{' '}
      <span className="text-foreground font-medium tabular-nums">{value}</span>
    </span>
  );
}
