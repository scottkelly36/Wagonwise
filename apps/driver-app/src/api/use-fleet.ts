import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAccessToken } from '../hooks/use-access-token';
import * as fleetApi from './fleet';

const MY_LINKS_KEY = ['my-driver-links'] as const;

export function useMyLinks() {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: MY_LINKS_KEY,
    queryFn: () => fleetApi.listMyLinks(accessToken),
  });
}

export function useJoinWithCode() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => fleetApi.joinWithCode(accessToken, code),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: MY_LINKS_KEY }),
  });
}

export function useRespondToInvitation() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      fleetApi.respondToInvitation(accessToken, id, accept),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: MY_LINKS_KEY }),
  });
}

export function useLeaveLink() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fleetApi.leaveLink(accessToken, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: MY_LINKS_KEY }),
  });
}
