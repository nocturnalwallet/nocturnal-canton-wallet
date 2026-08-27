import { ArrowLeftIcon } from 'lucide-react';
import { useElfaTopMentions } from '../../hooks/useElfa';
import { StateWrap } from './elfa-shared';
import { ElfaMentionRow } from './ElfaMentionRow';

/** Drill-down for a trending token: its top social mentions. */
export function ElfaTokenDetail({
  token,
  onBack,
}: {
  token: string;
  onBack: () => void;
}) {
  const { data, isLoading, error, refetch } = useElfaTopMentions(token, true);
  const items = data ?? [];
  return (
    <div className="space-y-2 p-3">
      <button
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" /> Back
      </button>
      <p className="text-foreground text-sm font-semibold">
        <span className="uppercase">{token}</span> · top mentions
      </p>
      <StateWrap
        isLoading={isLoading}
        error={error}
        isEmpty={items.length === 0}
        emptyText="No mentions found for this token."
        onRetry={refetch}
      >
        {items.map((m) => (
          <ElfaMentionRow key={m.tweetId} mention={m} />
        ))}
      </StateWrap>
    </div>
  );
}
