import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReportHazardRequest } from '@wagonwise/contracts/hazards';

import { useAccessToken } from '../hooks/use-access-token';
import * as hazardsApi from './hazards';

const HAZARD_KEY = ['hazard'] as const;

/** A mutation, not a query — reporting a hazard is an action a driver takes (tap to drop a pin),
 *  same reasoning as `useCreateRoutePlan`/`useStartTrip`. */
export function useReportHazard() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: (input: ReportHazardRequest) => hazardsApi.reportHazard(accessToken, input),
  });
}

/** A mutation, not a query — parsing a transcript is a one-off action taken as part of the voice
 *  report flow (M7.3), not data to cache/refetch. */
export function useParseVoiceHazardReport() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: (transcript: string) => hazardsApi.parseVoiceHazardReport(accessToken, transcript),
  });
}

export function useHazard(id: string) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: [...HAZARD_KEY, id],
    queryFn: () => hazardsApi.getHazard(accessToken, id),
  });
}

export function useConfirmHazard() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hazardsApi.confirmHazard(accessToken, id),
    onSuccess: (report) =>
      void queryClient.invalidateQueries({ queryKey: [...HAZARD_KEY, report.id] }),
  });
}

export function useDismissHazard() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hazardsApi.dismissHazard(accessToken, id),
    onSuccess: (report) =>
      void queryClient.invalidateQueries({ queryKey: [...HAZARD_KEY, report.id] }),
  });
}
