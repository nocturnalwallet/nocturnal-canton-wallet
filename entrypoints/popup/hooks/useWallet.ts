import { sendMessage, MSG } from '@lib/messaging';
import type { KeyPairData, OnboardingPrepareData, PreapprovalStatusData } from '@lib/messaging';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useCreateKeypair() {
  return useMutation({
    mutationFn: () =>
      sendMessage<KeyPairData>({ action: MSG.CREATE_KEYPAIR }),
  });
}

export function useValidateImportKey() {
  return useMutation({
    mutationFn: (params: { privateKey: string; expectedPublicKey?: string }) =>
      sendMessage<KeyPairData>({
        action: MSG.VALIDATE_IMPORT_KEY,
        payload: params,
      }),
  });
}

export function usePrepareOnboarding() {
  return useMutation({
    mutationFn: (publicKey: string) =>
      sendMessage<OnboardingPrepareData>({
        action: MSG.PREPARE_ONBOARDING,
        payload: { publicKey },
      }),
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      password: string;
      privateKey: string;
      publicKey: string;
    }) =>
      sendMessage<{ success: boolean }>({
        action: MSG.COMPLETE_ONBOARDING,
        payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}

export function useExportPrivateKey() {
  return useMutation({
    mutationFn: (password: string) =>
      sendMessage<{ privateKey: string }>({
        action: MSG.EXPORT_PRIVATE_KEY,
        payload: { password },
      }),
  });
}

export function usePreapprovalStatus() {
  return useQuery({
    queryKey: ['preapprovalStatus'],
    queryFn: () =>
      sendMessage<PreapprovalStatusData>({
        action: MSG.GET_PREAPPROVAL_STATUS,
      }),
  });
}

export function useRegisterPreapproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      sendMessage<{ success: boolean }>({
        action: MSG.REGISTER_TRANSFER_PREAPPROVAL,
      }),
    onSuccess: () => {
      // Invalidate so the next query hits the background handler, which
      // now returns true immediately via its in-memory flag.
      queryClient.invalidateQueries({ queryKey: ['preapprovalStatus'] });
    },
  });
}
