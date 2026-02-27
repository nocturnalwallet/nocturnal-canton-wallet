import { useEffect } from 'react';
import { sendMessage, MSG } from '@lib/messaging';
import type { LockStateData } from '@lib/messaging';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useLockState() {
  const queryClient = useQueryClient();

  // Listen for background auto-lock (session storage change)
  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if ('unlocked' in changes) {
        queryClient.invalidateQueries({ queryKey: ['lockState'] });
      }
    };
    chrome.storage.session.onChanged.addListener(listener);
    return () => chrome.storage.session.onChanged.removeListener(listener);
  }, [queryClient]);

  return useQuery({
    queryKey: ['lockState'],
    queryFn: () => sendMessage<LockStateData>({ action: MSG.GET_LOCK_STATE }),
    refetchOnWindowFocus: true,
  });
}

export function useUnlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (password: string) =>
      sendMessage<LockStateData>({
        action: MSG.UNLOCK,
        payload: { password },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lockState'] });
    },
  });
}

export function useLock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => sendMessage<LockStateData>({ action: MSG.LOCK }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lockState'] });
    },
  });
}
