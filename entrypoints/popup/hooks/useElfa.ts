import { sendMessage, MSG } from '@lib/messaging';
import type {
  ElfaTrendingTokensData,
  ElfaNarrativesData,
  ElfaTimeWindow,
  ElfaTopMentionsData,
  ElfaKeywordMentionsData,
  ElfaSmartStats,
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

export function useElfaTopMentions(ticker: string, enabled = true) {
  return useQuery({
    queryKey: [queryKey.ELFA_TOP_MENTIONS, ticker],
    queryFn: () =>
      sendMessage<ElfaTopMentionsData>({
        action: MSG.FETCH_ELFA_TOP_MENTIONS,
        payload: { ticker },
      }),
    enabled: enabled && !!ticker,
    ...SHARED,
  });
}

export function useElfaKeywordMentions(keywords: string, enabled = true) {
  return useQuery({
    queryKey: [queryKey.ELFA_KEYWORD_MENTIONS, keywords],
    queryFn: () =>
      sendMessage<ElfaKeywordMentionsData>({
        action: MSG.FETCH_ELFA_KEYWORD_MENTIONS,
        payload: { keywords },
      }),
    enabled: enabled && !!keywords,
    ...SHARED,
  });
}

// Credibility rarely changes — cache for 30 min so repeat taps on the same
// handle cost nothing.
export function useElfaSmartStats(username: string, enabled = true) {
  return useQuery({
    queryKey: [queryKey.ELFA_SMART_STATS, username],
    queryFn: () =>
      sendMessage<ElfaSmartStats>({
        action: MSG.FETCH_ELFA_SMART_STATS,
        payload: { username },
      }),
    enabled: enabled && !!username,
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
