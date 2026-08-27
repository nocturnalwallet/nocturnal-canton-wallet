import { useState } from 'react';
import {
  TrendingUpIcon,
  TrendingDownIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronRightIcon,
  InfoIcon,
} from 'lucide-react';
import {
  useElfaTrendingTokens,
  useElfaNarratives,
} from '../../hooks/useElfa';
import type { ElfaNarrative, ElfaTimeWindow } from '@lib/messaging';
import { IconCanton } from '@assets/icons/icon-canton';
import { StateWrap, handleFromUrl, safeExternalUrl } from './elfa-shared';
import { ElfaTokenDetail } from './ElfaTokenDetail';
import { ElfaSearch } from './ElfaSearch';

type View = 'tokens' | 'narratives' | 'search';

const VIEWS: { id: View; label: string }[] = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'narratives', label: 'Narratives' },
  { id: 'search', label: 'Search' },
];

const WINDOWS: ElfaTimeWindow[] = ['24h', '7d'];

/**
 * Phase-1 Market Intelligence — renders Elfa's read-only data natively (no
 * iframe / widget). Data is proxied by the wallet-provider backend so the Elfa
 * key stays server-side. Only the active sub-tab fetches, to conserve the
 * free-tier credit budget. The 24h/7d window is shared across Tokens/News/Narratives.
 */
export function MarketIntelligence() {
  const [view, setView] = useState<View>('tokens');
  const [window, setWindow] = useState<ElfaTimeWindow>('24h');
  const [drillToken, setDrillToken] = useState<string | null>(null);

  const changeView = (v: View) => {
    setView(v);
    setDrillToken(null);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Segmented control */}
      <div className="border-border flex gap-1 border-b p-2">
        {VIEWS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => changeView(id)}
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
        {view === 'tokens' &&
          (drillToken ? (
            <ElfaTokenDetail token={drillToken} onBack={() => setDrillToken(null)} />
          ) : (
            <TrendingTokensView
              window={window}
              onWindow={setWindow}
              active
              onSelect={setDrillToken}
            />
          ))}
        {view === 'narratives' && (
          <NarrativesView window={window} onWindow={setWindow} active />
        )}
        {view === 'search' && <ElfaSearch />}
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

/** Header row: window toggle (+ optional info tooltip) on the left, refresh on the right. */
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

interface ViewProps {
  window: ElfaTimeWindow;
  onWindow: (w: ElfaTimeWindow) => void;
  active: boolean;
}

function TrendingTokensView({
  window,
  onWindow,
  active,
  onSelect,
}: ViewProps & { onSelect: (token: string) => void }) {
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
        info="Ranked by trending social mentions (via Elfa). Change % = growth in mention count vs the prior window. Bar = each token's share of the top 10 shown. Tap a token for its top mentions. These differ from Elfa Chat's full-corpus mindshare figures."
      />
      {data?.canton && (
        <div className="border-primary/25 bg-primary/10 flex items-center gap-3 rounded-xl border p-3">
          <div className="bg-background flex h-8 w-8 items-center justify-center overflow-hidden rounded-full">
            <IconCanton className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-foreground font-medium">
              {data.canton.token.toUpperCase()}
              <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                {data.canton.label}
              </span>
            </p>
            <p className="text-primary text-[10px]">Canton-native · not on Elfa</p>
          </div>
          <span className="text-foreground text-sm font-medium tabular-nums">
            $
            {Number(data.canton.priceUsd).toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })}
          </span>
        </div>
      )}
      <StateWrap
        isLoading={isLoading}
        error={error}
        isEmpty={tokens.length === 0}
        emptyText="No trending tokens right now."
        onRetry={refetch}
      >
        <p className="text-muted-foreground px-0.5 text-[10px] leading-snug">
          Change = mentions vs prior {window} · bar = share of top {tokens.length} · tap for mentions
        </p>
        {tokens.map((t, i) => {
          const up = t.change_percent >= 0;
          const share = (t.current_count / totalMentions) * 100;
          return (
            <button
              key={t.token}
              onClick={() => onSelect(t.token)}
              className="bg-primary/5 border-primary/10 hover:bg-primary/10 hover:border-primary/25 flex w-full flex-col gap-2 rounded-xl border p-3 text-left transition-colors"
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
                <ChevronRightIcon className="text-muted-foreground h-4 w-4 shrink-0" />
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
            </button>
          );
        })}
        <p className="text-muted-foreground px-0.5 pt-1 text-[10px] leading-snug">
          Trending signal — differs from Elfa Chat's full-corpus totals.
        </p>
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

function NarrativeCard({ n }: { n: ElfaNarrative }) {
  const [open, setOpen] = useState(false);
  // Only keep safe http(s) source links (Elfa data is third-party).
  const links = (n.source_links ?? [])
    .map((l) => safeExternalUrl(l))
    .filter((l): l is string => l !== null);
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
          {links.map((link, j) => {
            const h = handleFromUrl(link);
            return (
              <a
                key={j}
                href={link}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-primary flex items-center gap-1.5 text-xs transition-colors"
              >
                <ExternalLinkIcon className="h-3 w-3 shrink-0" />
                <span className="truncate">{h ? `@${h}` : link}</span>
              </a>
            );
          })}
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
