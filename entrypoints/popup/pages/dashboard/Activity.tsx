import { useState } from 'react';
import { Loader2Icon, ExternalLinkIcon, ArrowUpRightIcon, ArrowDownLeftIcon, AlertCircleIcon } from 'lucide-react';
import { useActivity } from '../../hooks/useActivity';
import { sendMessage, MSG } from '@lib/messaging';
import type { AuthStateData } from '@lib/messaging';
import { format } from '@lib/format';
import BigNumber from 'bignumber.js';
import { useQuery } from '@tanstack/react-query';
import { useNetwork } from '../../hooks/useNetwork';

export function Activity() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useActivity({ page, limit: 10 });
  const { data: authState } = useQuery({
    queryKey: ['authState'],
    queryFn: () => sendMessage<AuthStateData>({ action: MSG.GET_AUTH_STATE }),
  });
  const { config: networkConfig } = useNetwork();

  const partyId = authState?.partyId ?? '';
  const explorerLink = networkConfig?.explorerUrl ?? '';

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
        <p className="text-sm text-destructive">Failed to load activity</p>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const items = data?.data ?? [];

  if (items.length === 0) {
    return <div className="text-center text-sm text-muted-foreground py-8">No activity yet</div>;
  }

  return (
    <div className="p-3 space-y-2">
      {items.map((item, i) => {
        const isSender = item.sender === partyId;
        const tokenId = item.instrumentId?.id ?? 'Unknown';

        return (
          <div
            key={`${item.updateId}-${i}`}
            className="rounded-xl bg-secondary p-3 flex items-center gap-3"
          >
            <div className={`rounded-full p-2 ${isSender ? 'bg-red-500/20' : 'bg-positive/20'}`}>
              {isSender ? (
                <ArrowUpRightIcon className="w-4 h-4 text-red-400" />
              ) : (
                <ArrowDownLeftIcon className="w-4 h-4 text-positive" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {isSender ? 'Sent' : 'Received'} {tokenId}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {item.timestamp ? format.date(new Date(item.timestamp)) : ''}
              </p>
            </div>

            <div className="text-right flex items-center gap-1">
              <p className={`text-sm font-medium ${isSender ? 'text-red-400' : 'text-positive'}`}>
                {isSender ? '-' : '+'}
                {new BigNumber(item.amount).toFormat()}
              </p>
              {explorerLink && item.updateId && (
                <a
                  href={`${explorerLink}/transactions/${item.updateId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLinkIcon className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        );
      })}

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
