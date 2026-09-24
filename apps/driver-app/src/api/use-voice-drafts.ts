import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { useAccessToken } from '../hooks/use-access-token';
import type { MapPoint } from '../components/route-map';
import {
  listVoiceHazardDrafts,
  removeVoiceHazardDraft,
  type VoiceHazardDraft,
} from '../db/voice-draft-queue';
import { enqueueHazardReport } from '../db/hazard-queue';
import { reportRequestForDraft } from '../lib/voice-draft-to-report';
import * as hazardsApi from './hazards';

const VOICE_DRAFTS_KEY = ['voice-drafts'] as const;

/** Local SQLite, not the network — same `useQuery` shape as every remote list in this app
 *  (`useVehicleProfiles`, `useHazard`) regardless of where the data actually comes from, so
 *  `voice-drafts.tsx` doesn't need a different pattern just because this one's on-device. */
export function useVoiceDrafts() {
  return useQuery({ queryKey: VOICE_DRAFTS_KEY, queryFn: listVoiceHazardDrafts });
}

export function useDiscardVoiceDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeVoiceHazardDraft(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: VOICE_DRAFTS_KEY }),
  });
}

/**
 * Files a reviewed draft (M7.4) through the exact same offline-first path every other report in
 * this app uses: queued locally before the network call, so a dropped connection never loses it.
 * The draft row is removed once enqueued, not once sent — from that point on the report is
 * *confirmed*, and `useHazardQueueFlush` (`hazard_queue`) owns getting it there, the same as a
 * tap-to-drop report that happened to be made offline.
 */
export function useFileVoiceDraft() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      draft,
      origin,
    }: {
      readonly draft: VoiceHazardDraft;
      readonly origin: MapPoint;
    }) => {
      const request = reportRequestForDraft(draft, Crypto.randomUUID(), origin);
      await enqueueHazardReport(request);
      await removeVoiceHazardDraft(draft.id);
      // Best-effort immediate send — useHazardQueueFlush retries if this fails (e.g. offline).
      await hazardsApi.reportHazard(accessToken, request).catch(() => undefined);
      return request;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: VOICE_DRAFTS_KEY }),
  });
}
