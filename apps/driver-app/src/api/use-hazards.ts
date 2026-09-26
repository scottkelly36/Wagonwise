import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReportHazardRequest } from '@wagonwise/contracts/hazards';
import type { GeoPointDto } from '@wagonwise/contracts/routing';

import { useAccessToken } from '../hooks/use-access-token';
import * as hazardsApi from './hazards';

const HAZARD_KEY = ['hazard'] as const;
const NEARBY_HAZARDS_KEY = ['hazards', 'nearby'] as const;

/** Design doc §5's "poll every 60-120 seconds while the app is open" (no websockets in Phase 1),
 *  applied to the simpler point/corridor query this app actually uses (see
 *  `find-nearby-hazards.ts`, core). */
const NEARBY_HAZARDS_POLL_MS = 90_000;

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

/** `id` may be `undefined` — the hazard-detail drawer (`components/hazard-detail-drawer.tsx`)
 *  renders even while nothing's selected, so it always calls this hook (Rules of Hooks), just
 *  disabled until a driver actually taps a marker. */
export function useHazard(id: string | undefined) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: [...HAZARD_KEY, id],
    queryFn: () => hazardsApi.getHazard(accessToken, id as string),
    enabled: id !== undefined,
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

/** Admin-only test-data cleanup (2026-09-26), not a driver-facing feature — the button that
 *  calls this shows for everyone (simpler than teaching the app "am I an admin"), and a non-admin
 *  just gets a real 403 with a friendly message (lib/error-messages.ts). */
export function useDeleteHazard() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hazardsApi.deleteHazard(accessToken, id),
    onSuccess: (_data, id) => void queryClient.invalidateQueries({ queryKey: [...HAZARD_KEY, id] }),
  });
}

/** `corridor` is one point for "near me" (home screen) or the decoded route line for "near my
 *  route" (plan-route/active-trip) — disabled entirely until there's at least one point, since an
 *  empty corridor is a 400 (contracts' `findNearbyHazardsRequestSchema`), not a valid "no results"
 *  query. */
export function useNearbyHazards(corridor: readonly GeoPointDto[], radiusM: number) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: [...NEARBY_HAZARDS_KEY, corridor, radiusM],
    queryFn: () => hazardsApi.findNearbyHazards(accessToken, { corridor: [...corridor], radiusM }),
    enabled: corridor.length > 0,
    refetchInterval: NEARBY_HAZARDS_POLL_MS,
  });
}
