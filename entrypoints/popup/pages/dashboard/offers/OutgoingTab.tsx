import { useState } from 'react';
import { Loader2Icon, LockIcon, AlertCircleIcon } from 'lucide-react';
import { useOutgoingOffers } from '../../../hooks/useOffers';
import { format } from '@lib/format';
import BigNumber from 'bignumber.js';

export function OutgoingTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useOutgoingOffers({ page, limit: 5 });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2Icon className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2">
        <AlertCircleIcon className="w-5 h-5 text-destructive" />
        <p className="text-sm text-destructive">Failed to load outgoing offers</p>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const items = data?.data ?? [];

  if (items.length === 0) {
    return <div className="text-center text-sm text-muted-foreground py-8">No outgoing offers</div>;
  }

  return (
    <div className="p-3 space-y-3">
      {items.map((item) => (
        <div key={item.contractId} className="rounded-xl bg-secondary p-3 space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium text-foreground">
              {new BigNumber(item.amount).toFormat()} {item.tokenName}
            </p>
            <div className="flex items-center gap-1 text-xs text-amber-400">
              <LockIcon className="w-3 h-3" /> Locked
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            To: {format.truncatePartyId(item.receiver, 5)}
          </p>
          <p className="text-xs text-muted-foreground">
            {item.createdAt ? format.date(new Date(item.createdAt)) : ''}
          </p>
        </div>
      ))}

      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <button
            disabled={!data.has_previous}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded text-xs bg-secondary text-foreground disabled:opacity-30"
          >
            Prev
          </button>
          <span className="text-xs text-muted-foreground py-1">
            {data.page} / {data.totalPages}
          </span>
          <button
            disabled={!data.has_next}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 rounded text-xs bg-secondary text-foreground disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
