import { sendMessage, MSG } from '@lib/messaging';
import type {
  ElfaTrendingTokensData,
  ElfaTokenNewsData,
  ElfaNarrativesData,
  ElfaTimeWindow,
} from '@lib/messaging';
import { useQuery } from '@tanstack/react-query';
import { queryKey } from '@lib/constants';

// Elfa free tier is credit-limited (1000/mo), so cache aggressively and only
// fetch the sub-tab the user is actually viewing (`enabled`). The window is part
// of each query key so switching 24h/7d caches independently.
const SHARED = { staleTime: 5 * 60_000, refetchOnWindowFocus: false, retry: false as const };

export function useElfaTrendingTokens(window: ElfaTimeWindow, enabled = true) {
  return useQuery({
    queryKey: [queryKey.ELFA_TRENDING_TOKENS, window],
    queryFn: () =>
      sendMessage<ElfaTrendingTokensData>({
        action: MSG.FETCH_ELFA_TRENDING_TOKENS,
        payload: { window },
      }),
    enabled,
    ...SHARED,
  });
}

export function useElfaTokenNews(window: ElfaTimeWindow, enabled = true) {
  return useQuery({
    queryKey: [queryKey.ELFA_TOKEN_NEWS, window],
    queryFn: () =>
      sendMessage<ElfaTokenNewsData>({
        action: MSG.FETCH_ELFA_TOKEN_NEWS,
        payload: { window },
      }),
    enabled,
    ...SHARED,
  });
}

export function useElfaNarratives(window: ElfaTimeWindow, enabled = true) {
  return useQuery({
    queryKey: [queryKey.ELFA_NARRATIVES, window],
    queryFn: () =>
      sendMessage<ElfaNarrativesData>({
        action: MSG.FETCH_ELFA_NARRATIVES,
        payload: { window },
      }),
    enabled,
    ...SHARED,
  });
}
