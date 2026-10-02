import type { AdvanceJobStatusRequest } from '@wagonwise/contracts/jobs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAccessToken } from '../hooks/use-access-token';
import * as jobsApi from './jobs';

const CURRENT_JOB_KEY = ['current-job'] as const;

export function useCurrentJob() {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: CURRENT_JOB_KEY,
    queryFn: () => jobsApi.getCurrentJob(accessToken),
  });
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
