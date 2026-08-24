import { sendMessage, MSG } from '@lib/messaging';
import type {
  ElfaTrendingTokensData,
  ElfaTokenNewsData,
  ElfaNarrativesData,
} from '@lib/messaging';
import { useQuery } from '@tanstack/react-query';
import { queryKey } from '@lib/constants';

// Elfa free tier is credit-limited (1000/mo), so cache aggressively and only
// fetch the sub-tab the user is actually viewing (`enabled`).
const SHARED = { staleTime: 5 * 60_000, refetchOnWindowFocus: false, retry: false as const };

export function useElfaTrendingTokens(enabled = true) {
  return useQuery({
    queryKey: [queryKey.ELFA_TRENDING_TOKENS],
    queryFn: () =>
      sendMessage<ElfaTrendingTokensData>({ action: MSG.FETCH_ELFA_TRENDING_TOKENS }),
    enabled,
    ...SHARED,
  });
}

export function useElfaTokenNews(enabled = true) {
  return useQuery({
    queryKey: [queryKey.ELFA_TOKEN_NEWS],
    queryFn: () => sendMessage<ElfaTokenNewsData>({ action: MSG.FETCH_ELFA_TOKEN_NEWS }),
    enabled,
    ...SHARED,
  });
}

export function useElfaNarratives(enabled = true) {
  return useQuery({
    queryKey: [queryKey.ELFA_NARRATIVES],
    queryFn: () => sendMessage<ElfaNarrativesData>({ action: MSG.FETCH_ELFA_NARRATIVES }),
    enabled,
    ...SHARED,
  });
}
