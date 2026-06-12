import { useState } from 'react';
import { Loader2Icon, CheckCircleIcon, XCircleIcon, LockIcon, AlertTriangleIcon, AlertCircleIcon, ShieldCheckIcon } from 'lucide-react';
import { useHistoryOffers } from '../../../hooks/useOffers';
import { format } from '@lib/format';
import BigNumber from 'bignumber.js';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
  APPROVED: { label: 'APPROVED', color: 'text-positive', icon: CheckCircleIcon },
  AUTO_APPROVED: { label: 'AUTO APPROVED', color: 'text-positive', icon: ShieldCheckIcon },
  CANCELLED: { label: 'CANCELLED', color: 'text-red-500', icon: XCircleIcon },
  REJECTED: { label: 'REJECTED', color: 'text-red-500', icon: XCircleIcon },
  LOCKED: { label: 'LOCKED', color: 'text-amber-400', icon: LockIcon },
  EXPIRED: { label: 'EXPIRED', color: 'text-gray-400', icon: AlertTriangleIcon },
};

export function HistoryTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useHistoryOffers({ page, limit: 5 });

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
        <p className="text-sm text-destructive">Failed to load history</p>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const items = data?.data ?? [];

  if (items.length === 0) {
    return <div className="text-center text-sm text-muted-foreground py-8">No history</div>;
  }

  return (
    <div className="p-3 space-y-3">
      {items.map((item, i) => {
        const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.APPROVED;
        const StatusIcon = cfg.icon;

        return (
          <div key={`${item.contractId}-${i}`} className="rounded-xl bg-secondary p-3 space-y-1">
            <div className="flex justify-between items-center">
              <p className="text-sm font-medium text-foreground">
                {new BigNumber(item.amount).toFormat()} {item.tokenName}
              </p>
              <div className={`flex items-center gap-1 text-xs ${cfg.color}`}>
                <StatusIcon className="w-3 h-3" />
                {cfg.label}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {item.updatedAt ? format.date(new Date(item.updatedAt)) : ''}
            </p>
            <p className="text-xs text-muted-foreground">
              {item.sender && format.truncatePartyId(item.sender, 5)} → {item.receiver && format.truncatePartyId(item.receiver, 5)}
            </p>
          </div>
        );
      })}

      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <button
            disabled={!data.has_previous}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded text-xs bg-secondary text-foreground transition-colors hover:bg-primary/10 active:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-secondary"
          >
            Prev
          </button>
          <span className="text-xs text-muted-foreground py-1">
            {data.page} / {data.totalPages}
          </span>
          <button
            disabled={!data.has_next}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 rounded text-xs bg-secondary text-foreground transition-colors hover:bg-primary/10 active:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-secondary"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
