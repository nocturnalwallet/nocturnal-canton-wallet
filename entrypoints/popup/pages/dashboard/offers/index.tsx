import { useState } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKey } from '@lib/constants';
import { IncomingTab } from './IncomingTab';
import { OutgoingTab } from './OutgoingTab';

type OfferTab = 'incoming' | 'outgoing';

export function Offers() {
  const [tab, setTab] = useState<OfferTab>('incoming');
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [queryKey.INCOMING_REQUESTS] }),
      queryClient.invalidateQueries({ queryKey: [queryKey.OUTGOING_REQUESTS] }),
    ]);
    setRefreshing(false);
  };

  const tabs: { id: OfferTab; label: string }[] = [
    { id: 'incoming', label: 'Incoming' },
    { id: 'outgoing', label: 'Outgoing' },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex items-center border-b">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? 'text-primary border-primary border-b-2'
                : 'text-muted-foreground'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-muted-foreground hover:text-foreground px-2 py-2 transition-colors"
          title="Refresh offers"
        >
          <RefreshCwIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'incoming' && <IncomingTab />}
        {tab === 'outgoing' && <OutgoingTab />}
      </div>
    </div>
  );
}
