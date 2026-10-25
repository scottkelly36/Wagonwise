import { useMutation } from '@tanstack/react-query';
import type { RaiseSosRequest } from '@wagonwise/contracts/sos';

import { useAccessToken } from '../hooks/use-access-token';
import * as sosApi from './sos';

/** Raises SOS. Never retried on its own (the screen offers Try again with the same request id, which is safe). */
export function useRaiseSos() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: (input: RaiseSosRequest) => sosApi.raiseSos(accessToken, input),
    retry: false,
  });
}

export function useCancelSos() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: (requestId: string) => sosApi.cancelSos(accessToken, requestId),
    retry: false,
  });
}
