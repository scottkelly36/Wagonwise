import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SendMyTachographFileRequest } from '@wagonwise/contracts/tachograph';

import { useAccessToken } from '../hooks/use-access-token';
import { getMyTachographCompanies, sendMyTachographFile } from './tachograph';

const KEY = ['my-tachograph'] as const;

export function useMyTachograph() {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: KEY,
    queryFn: () => getMyTachographCompanies(accessToken),
    enabled: accessToken !== '',
  });
}

export function useSendTachographFile() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { companyId: string; file: SendMyTachographFileRequest }) =>
      sendMyTachographFile(accessToken, input.companyId, input.file),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
