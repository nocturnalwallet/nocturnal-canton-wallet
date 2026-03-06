import { sendMessage, MSG } from '@lib/messaging';
import type { PaginatedOffersData, PrepareData } from '@lib/messaging';
import type {
  GetIncomingRequestsQuery,
  GetHistoryRequestsQuery,
  PrepareTransferTokenStandardResponse,
} from '@lib/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKey } from '@lib/constants';

export function useIncomingOffers(params: GetIncomingRequestsQuery) {
  return useQuery({
    queryKey: [queryKey.INCOMING_REQUESTS, params],
    queryFn: () =>
      sendMessage<PaginatedOffersData>({
        action: MSG.FETCH_INCOMING_OFFERS,
        payload: params,
      }),
  });
}

export function useOutgoingOffers(params: GetIncomingRequestsQuery) {
  return useQuery({
    queryKey: [queryKey.OUTGOING_REQUESTS, params],
    queryFn: () =>
      sendMessage<PaginatedOffersData>({
        action: MSG.FETCH_OUTGOING_OFFERS,
        payload: params,
      }),
  });
}

export function useHistoryOffers(params: GetHistoryRequestsQuery) {
  return useQuery({
    queryKey: [queryKey.HISTORY_REQUESTS, params],
    queryFn: () =>
      sendMessage<PaginatedOffersData>({
        action: MSG.FETCH_HISTORY_OFFERS,
        payload: params,
      }),
  });
}

export function usePrepareApprove() {
  return useMutation({
    mutationFn: (payload: { contractId: string; tokenId: string }) =>
      sendMessage<PrepareData>({
        action: MSG.PREPARE_APPROVE,
        payload,
      }),
  });
}

export function usePrepareReject() {
  return useMutation({
    mutationFn: (payload: { contractId: string; tokenId: string }) =>
      sendMessage<PrepareData>({
        action: MSG.PREPARE_REJECT,
        payload,
      }),
  });
}

export function useSignAndSubmitApprove() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      password: string;
      preparedData: PrepareTransferTokenStandardResponse;
      contractId?: string;
    }) =>
      sendMessage<{ success: boolean }>({
        action: MSG.SIGN_AND_SUBMIT_APPROVE,
        payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey.INCOMING_REQUESTS] });
      queryClient.invalidateQueries({ queryKey: [queryKey.HISTORY_REQUESTS] });
      queryClient.invalidateQueries({ queryKey: [queryKey.BALANCE] });
    },
  });
}

export function useSignAndSubmitReject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      password: string;
      preparedData: PrepareTransferTokenStandardResponse;
      contractId?: string;
    }) =>
      sendMessage<{ success: boolean }>({
        action: MSG.SIGN_AND_SUBMIT_REJECT,
        payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey.INCOMING_REQUESTS] });
      queryClient.invalidateQueries({ queryKey: [queryKey.HISTORY_REQUESTS] });
      queryClient.invalidateQueries({ queryKey: [queryKey.BALANCE] });
    },
  });
}

export function usePrepareWithdraw() {
  return useMutation({
    mutationFn: (payload: { contractId: string; tokenId: string }) =>
      sendMessage<PrepareData>({
        action: MSG.PREPARE_WITHDRAW,
        payload,
      }),
  });
}

export function useSignAndSubmitWithdraw() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      password: string;
      preparedData: PrepareTransferTokenStandardResponse;
      contractId?: string;
    }) =>
      sendMessage<{ success: boolean }>({
        action: MSG.SIGN_AND_SUBMIT_WITHDRAW,
        payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey.OUTGOING_REQUESTS] });
      queryClient.invalidateQueries({ queryKey: [queryKey.HISTORY_REQUESTS] });
      queryClient.invalidateQueries({ queryKey: [queryKey.BALANCE] });
    },
  });
}
