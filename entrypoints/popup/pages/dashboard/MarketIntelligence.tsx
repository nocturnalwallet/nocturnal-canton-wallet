import { useState } from 'react';
import {
  Loader2Icon,
  AlertCircleIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InfoIcon,
} from 'lucide-react';
import {
  useElfaTrendingTokens,
  useElfaTokenNews,
  useElfaNarratives,
} from '../../hooks/useElfa';
import type { ElfaNarrative, ElfaTimeWindow } from '@lib/messaging';

type View = 'tokens' | 'news' | 'narratives';

const VIEWS: { id: View; label: string }[] = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'news', label: 'News' },
  { id: 'narratives', label: 'Narratives' },
];

const WINDOWS: ElfaTimeWindow[] = ['24h', '7d'];

/**
 * Phase-1 Market Intelligence — renders Elfa's read-only data natively (no
 * iframe / widget). Data is proxied by the wallet-provider backend so the Elfa
 * key stays server-side. Only the active sub-tab fetches, to conserve the
 * free-tier credit budget. The 24h/7d window is shared across all sub-tabs.
 */
export function MarketIntelligence() {
  const [view, setView] = useState<View>('tokens');
  const [window, setWindow] = useState<ElfaTimeWindow>('24h');

  return (
    <div className="flex h-full flex-col">
      {/* Segmented control */}
      <div className="border-border flex gap-1 border-b p-2">
        {VIEWS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
              view === id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {view === 'tokens' && (
          <TrendingTokensView window={window} onWindow={setWindow} active />
        )}
        {view === 'news' && <TokenNewsView window={window} onWindow={setWindow} active />}
        {view === 'narratives' && (
          <NarrativesView window={window} onWindow={setWindow} active />
        )}
      </div>

      <p className="text-muted-foreground border-border border-t px-3 py-1.5 text-center text-[10px]">
        Powered by Elfa
      </p>
    </div>
  );
}

function WindowToggle({
  value,
  onChange,
}: {
  value: ElfaTimeWindow;
  onChange: (w: ElfaTimeWindow) => void;
}) {
  return (
    <div className="bg-secondary/60 flex rounded-lg p-0.5">
      {WINDOWS.map((w) => (
        <button
          key={w}
          onClick={() => onChange(w)}
          className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
            value === w
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {w}
        </button>
      ))}
    </div>
  );
}

/** Header row shared by every view: window toggle on the left, refresh on the right. */
function ViewHeader({
  window,
  onWindow,
  onRefresh,
  spinning,
  info,
}: {
  window: ElfaTimeWindow;
  onWindow: (w: ElfaTimeWindow) => void;
  onRefresh: () => void;
  spinning: boolean;
  info?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <WindowToggle value={window} onChange={onWindow} />
        {info && (
          <span title={info} className="text-muted-foreground inline-flex cursor-help">
            <InfoIcon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <button
        onClick={onRefresh}
        disabled={spinning}
        className="text-muted-foreground hover:text-primary flex items-center gap-1 text-xs transition-colors disabled:opacity-50"
      >
        <RefreshCwIcon className={`h-3 w-3 ${spinning ? 'animate-spin' : ''}`} />
        Refresh
      </button>
    </div>
  );
}

/** Shared loading / error / empty scaffolding. */
function StateWrap({
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
  children: React.ReactNode;
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

interface ViewProps {
  window: ElfaTimeWindow;
  onWindow: (w: ElfaTimeWindow) => void;
  active: boolean;
}

function TrendingTokensView({ window, onWindow, active }: ViewProps) {
  const { data, isLoading, error, refetch, isFetching } = useElfaTrendingTokens(
    window,
    active,
  );
  const tokens = data?.data ?? [];
  // Mindshare = each token's share of total mentions across the shown set.
  const totalMentions = tokens.reduce((sum, t) => sum + (t.current_count || 0), 0) || 1;
  return (
    <div className="space-y-2 p-3">
      <ViewHeader
        window={window}
        onWindow={onWindow}
        onRefresh={refetch}
        spinning={isFetching}
        info="Ranked by social mentions over the selected window (via Elfa). The bar shows each token's share of total mentions (mindshare)."
      />
      <StateWrap
        isLoading={isLoading}
        error={error}
        isEmpty={tokens.length === 0}
        emptyText="No trending tokens right now."
        onRetry={refetch}
      >
        {tokens.map((t, i) => {
          const up = t.change_percent >= 0;
          const share = (t.current_count / totalMentions) * 100;
          return (
            <div
              key={t.token}
              className="bg-primary/5 border-primary/10 flex flex-col gap-2 rounded-xl border p-3"
            >
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground w-4 text-xs tabular-nums">{i + 1}</span>
                <span className="text-foreground flex-1 font-medium uppercase">{t.token}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {t.current_count.toLocaleString()} mentions
                </span>
                <span
                  className={`flex items-center gap-0.5 text-xs font-medium tabular-nums ${
                    up ? 'text-positive' : 'text-destructive'
                  }`}
                >
                  {up ? (
                    <TrendingUpIcon className="h-3 w-3" />
                  ) : (
                    <TrendingDownIcon className="h-3 w-3" />
                  )}
                  {up ? '+' : ''}
                  {t.change_percent.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-primary/10 h-1.5 flex-1 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${Math.max(share, 2)}%` }}
                  />
                </div>
                <span className="text-muted-foreground w-10 text-right text-[10px] tabular-nums">
                  {share.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </StateWrap>
    </div>
  );
}

function TokenNewsView({ window, onWindow, active }: ViewProps) {
  const { data, isLoading, error, refetch, isFetching } = useElfaTokenNews(window, active);
  const items = data ?? [];
  return (
    <div className="space-y-2 p-3">
      <ViewHeader
        window={window}
        onWindow={onWindow}
        onRefresh={refetch}
        spinning={isFetching}
      />
      <StateWrap
        isLoading={isLoading}
        error={error}
        isEmpty={items.length === 0}
        emptyText="No recent news mentions."
        onRetry={refetch}
      >
        {items.map((n) => (
          <a
            key={n.tweetId}
            href={n.link}
            target="_blank"
            rel="noreferrer"
            className="bg-primary/5 border-primary/10 hover:bg-primary/10 flex items-center gap-2 rounded-xl border p-3 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-sm font-medium">
                @{n.account.username}
              </p>
              <p className="text-muted-foreground text-xs">
                {new Date(n.mentionedAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {' · '}
                {n.viewCount.toLocaleString()} views
              </p>
            </div>
            <ExternalLinkIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          </a>
        ))}
      </StateWrap>
    </div>
  );
}

function narrativeLabel(n: ElfaNarrative): string {
  return (
    (typeof n.narrative === 'string' && n.narrative) ||
    (typeof n.theme === 'string' && n.theme) ||
    'Untitled narrative'
  );
}

/** Parse an @handle from an x.com/<user>/status/<id> URL for a friendlier label. */
function handleFromUrl(link: string): string {
  try {
    const seg = new URL(link).pathname.split('/').filter(Boolean);
    return seg[0] ? `@${seg[0]}` : link;
  } catch {
    return link;
  }
}

function NarrativeCard({ n }: { n: ElfaNarrative }) {
  const [open, setOpen] = useState(false);
  const links = n.source_links ?? [];
  const count = links.length;
  return (
    <div className="bg-primary/5 border-primary/10 overflow-hidden rounded-xl border">
      <button
        onClick={() => count > 0 && setOpen((o) => !o)}
        disabled={count === 0}
        className="flex w-full items-start gap-2 p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-medium">{narrativeLabel(n)}</p>
          {count > 0 && (
            <p className="text-muted-foreground mt-1 text-xs">
              {open ? 'Hide' : 'Show'} {count} source{count > 1 ? 's' : ''}
            </p>
          )}
        </div>
        {count > 0 &&
          (open ? (
            <ChevronUpIcon className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <ChevronDownIcon className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
          ))}
      </button>
      {open && count > 0 && (
        <div className="border-primary/10 space-y-1.5 border-t px-3 py-2">
          {links.map((link, j) => (
            <a
              key={j}
              href={link}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-primary flex items-center gap-1.5 text-xs transition-colors"
            >
              <ExternalLinkIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">{handleFromUrl(link)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function NarrativesView({ window, onWindow, active }: ViewProps) {
  const { data, isLoading, error, refetch, isFetching } = useElfaNarratives(window, active);
  const narratives = data?.trending_narratives ?? [];
  return (
    <div className="space-y-2 p-3">
      <ViewHeader
        window={window}
        onWindow={onWindow}
        onRefresh={refetch}
        spinning={isFetching}
      />
      <StateWrap
        isLoading={isLoading}
        error={error}
        isEmpty={narratives.length === 0}
        emptyText="No trending narratives right now."
        onRetry={refetch}
      >
        {narratives.map((n, i) => (
          <NarrativeCard key={i} n={n} />
        ))}
      </StateWrap>
    </div>
  );
}
