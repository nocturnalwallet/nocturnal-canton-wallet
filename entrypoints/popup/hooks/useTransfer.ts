import { sendMessage, MSG } from '@lib/messaging';
import type { PrepareData } from '@lib/messaging';
import type {
  PrepareTransferProps,
  PrepareTransferTokenStandardProps,
  PrepareTransferResponse,
  PrepareTransferTokenStandardResponse,
} from '@lib/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKey } from '@lib/constants';

export function usePrepareTransferPreapproval() {
  return useMutation({
    mutationFn: (payload: PrepareTransferProps) =>
      sendMessage<PrepareData>({
        action: MSG.PREPARE_TRANSFER_PREAPPROVAL,
        payload,
      }),
  });
}

export function useSignAndSubmitTransferPreapproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      password: string;
      preparedData: PrepareTransferResponse;
    }) =>
      sendMessage<{ success: boolean }>({
        action: MSG.SIGN_AND_SUBMIT_TRANSFER_PREAPPROVAL,
        payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey.BALANCE] });
      queryClient.invalidateQueries({ queryKey: [queryKey.HISTORY_REQUESTS] });
    },
  });
}

export function usePrepareTransferTokenStandard() {
  return useMutation({
    mutationFn: (payload: PrepareTransferTokenStandardProps) =>
      sendMessage<PrepareData>({
        action: MSG.PREPARE_TRANSFER_TOKEN_STANDARD,
        payload,
      }),
  });
}

export function useSignAndSubmitTransferTokenStandard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      password: string;
      preparedData: PrepareTransferTokenStandardResponse;
    }) =>
      sendMessage<{ success: boolean }>({
        action: MSG.SIGN_AND_SUBMIT_TRANSFER_TOKEN_STANDARD,
        payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey.BALANCE] });
      queryClient.invalidateQueries({ queryKey: [queryKey.HISTORY_REQUESTS] });
      queryClient.invalidateQueries({
        queryKey: [queryKey.OUTGOING_REQUESTS],
      });
    },
  });
}
