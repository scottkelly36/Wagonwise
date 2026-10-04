import type { AdvanceJobStatusRequest } from '@wagonwise/contracts/jobs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAccessToken } from '../hooks/use-access-token';
import * as jobsApi from './jobs';

export const CURRENT_JOB_KEY = ['current-job'] as const;

/** How often a screen that is showing the job asks the server again. There is no push yet (it needs
 *  an EAS project id), so without this a job assigned while the app is open would not appear until
 *  the app was restarted. */
export const CURRENT_JOB_POLL_MS = 20_000;

export function useCurrentJob() {
  const accessToken = useAccessToken();
  const query = useQuery({
    queryKey: CURRENT_JOB_KEY,
    queryFn: () => jobsApi.getCurrentJob(accessToken),
    refetchInterval: CURRENT_JOB_POLL_MS,
  });

  // Asking again the moment the driver comes back to the app, so a job assigned while it was in the
  // background is there as it opens, not up to 20 seconds later.
  const { refetch } = query;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refetch();
    });
    return () => subscription.remove();
  }, [refetch]);

  return query;
}

export function useAdvanceJobStatus() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, ...input }: { jobId: string } & AdvanceJobStatusRequest) =>
      jobsApi.advanceJobStatus(accessToken, jobId, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CURRENT_JOB_KEY }),
  });
}
