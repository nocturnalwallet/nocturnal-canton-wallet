import { useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { useElfaKeywordMentions } from '../../hooks/useElfa';
import { StateWrap } from './elfa-shared';
import { ElfaMentionRow } from './ElfaMentionRow';

// Canton-first quick queries. Search is explicit (submit) to conserve credits.
const QUICK = ['canton', 'cbtc', 'usdc'];

export function ElfaSearch() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const { data, isLoading, error, refetch } = useElfaKeywordMentions(query, !!query);
  const items = data ?? [];

  const submit = (q: string) => {
    const v = q.trim();
    if (!v) return;
    setInput(v);
    setQuery(v);
  };

  return (
    <div className="space-y-2 p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search mentions (e.g. canton)"
          className="border-primary/15 bg-background text-foreground focus:border-primary/40 flex-1 rounded-lg border px-3 py-1.5 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium transition-opacity disabled:opacity-50"
        >
          <SearchIcon className="h-4 w-4" />
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => submit(q)}
            className="bg-primary/10 text-primary hover:bg-primary/20 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      {!query ? (
        <div className="flex h-32 items-center justify-center px-6 text-center">
          <p className="text-muted-foreground text-xs">
            Search social mentions for any token or keyword.
          </p>
        </div>
      ) : (
        <StateWrap
          isLoading={isLoading}
          error={error}
          isEmpty={items.length === 0}
          emptyText={`No mentions found for "${query}".`}
          onRetry={refetch}
        >
          {items.map((m) => (
            <ElfaMentionRow key={m.tweetId} mention={m} />
          ))}
        </StateWrap>
      )}
    </div>
  );
}
