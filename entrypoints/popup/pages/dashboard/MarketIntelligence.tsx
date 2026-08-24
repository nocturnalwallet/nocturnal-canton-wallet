import { useState } from 'react';
import {
  Loader2Icon,
  AlertCircleIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
} from 'lucide-react';
import {
  useElfaTrendingTokens,
  useElfaTokenNews,
  useElfaNarratives,
} from '../../hooks/useElfa';
import type { ElfaNarrative } from '@lib/messaging';

type View = 'tokens' | 'news' | 'narratives';

const VIEWS: { id: View; label: string }[] = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'news', label: 'News' },
  { id: 'narratives', label: 'Narratives' },
];

/**
 * Phase-1 Market Intelligence — renders Elfa's read-only data natively (no
 * iframe / widget). Data is proxied by the wallet-provider backend so the Elfa
 * key stays server-side. Only the active sub-tab fetches, to conserve the
 * free-tier credit budget.
 */
export function MarketIntelligence() {
  const [view, setView] = useState<View>('tokens');

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
        {view === 'tokens' && <TrendingTokensView active={view === 'tokens'} />}
        {view === 'news' && <TokenNewsView active={view === 'news'} />}
        {view === 'narratives' && <NarrativesView active={view === 'narratives'} />}
      </div>

      <p className="text-muted-foreground border-border border-t px-3 py-1.5 text-center text-[10px]">
        Powered by Elfa
      </p>
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

function SectionRefresh({ onClick, spinning }: { onClick: () => void; spinning: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={spinning}
      className="text-muted-foreground hover:text-primary flex items-center gap-1 text-xs transition-colors disabled:opacity-50"
    >
      <RefreshCwIcon className={`h-3 w-3 ${spinning ? 'animate-spin' : ''}`} />
      Refresh
    </button>
  );
}

function TrendingTokensView({ active }: { active: boolean }) {
  const { data, isLoading, error, refetch, isFetching } = useElfaTrendingTokens(active);
  const tokens = data?.data ?? [];
  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium">Trending · 24h</p>
        <SectionRefresh onClick={() => refetch()} spinning={isFetching} />
      </div>
      <StateWrap
        isLoading={isLoading}
        error={error}
        isEmpty={tokens.length === 0}
        emptyText="No trending tokens right now."
        onRetry={refetch}
      >
        {tokens.map((t, i) => {
          const up = t.change_percent >= 0;
          return (
            <div
              key={t.token}
              className="bg-primary/5 border-primary/10 flex items-center gap-3 rounded-xl border p-3"
            >
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
          );
        })}
      </StateWrap>
    </div>
  );
}

function TokenNewsView({ active }: { active: boolean }) {
  const { data, isLoading, error, refetch, isFetching } = useElfaTokenNews(active);
  const items = data ?? [];
  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium">Latest mentions · 24h</p>
        <SectionRefresh onClick={() => refetch()} spinning={isFetching} />
      </div>
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

function NarrativesView({ active }: { active: boolean }) {
  const { data, isLoading, error, refetch, isFetching } = useElfaNarratives(active);
  const narratives = data?.trending_narratives ?? [];
  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium">Trending narratives</p>
        <SectionRefresh onClick={() => refetch()} spinning={isFetching} />
      </div>
      <StateWrap
        isLoading={isLoading}
        error={error}
        isEmpty={narratives.length === 0}
        emptyText="No trending narratives right now."
        onRetry={refetch}
      >
        {narratives.map((n, i) => (
          <div key={i} className="bg-primary/5 border-primary/10 rounded-xl border p-3">
            <p className="text-foreground text-sm font-medium">{narrativeLabel(n)}</p>
          </div>
        ))}
      </StateWrap>
    </div>
  );
}
