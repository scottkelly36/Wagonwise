import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAccessToken } from '../hooks/use-access-token';
import { claimReward, getMyReferrals } from './referrals';

const KEY = ['my-referrals'] as const;

export function useMyReferrals() {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: KEY,
    queryFn: () => getMyReferrals(accessToken),
    enabled: accessToken !== '',
  });
}

export function useClaimReward() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; email: string }) =>
      claimReward(accessToken, input.id, input.email),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
