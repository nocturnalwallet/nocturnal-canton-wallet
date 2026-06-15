import { sendMessage } from '@lib/messaging';
import { MSG } from '@lib/messaging';
import type { AuthStateData, GoogleAuthData } from '@lib/messaging';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useAuthState() {
  return useQuery({
    queryKey: ['authState'],
    queryFn: () => sendMessage<AuthStateData>({ action: MSG.GET_AUTH_STATE }),
    refetchOnWindowFocus: true,
  });
}

export function useGoogleAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      sendMessage<GoogleAuthData>({ action: MSG.GOOGLE_AUTH }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['authState'] });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => sendMessage<void>({ action: MSG.LOGOUT }),
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}
