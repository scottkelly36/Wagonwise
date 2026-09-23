import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateVehicleProfileRequest } from '@wagonwise/contracts/routing';

import { useAuthStore } from '../state/auth-store';
import * as routingApi from './routing';

const VEHICLE_PROFILES_KEY = ['vehicle-profiles'] as const;

/** These hooks only ever render on the signed-in side of the app (behind src/app/index.tsx's
 *  redirect gate), so a missing access token here is a real wiring bug, not a state a driver can
 *  reach — fails loudly rather than silently calling the API with no auth. */
function useAccessToken(): string {
  const state = useAuthStore((s) => s.state);
  if (state.status !== 'signedIn') {
    throw new Error('useAccessToken: called while not signed in');
  }
  return state.accessToken;
}

export function useVehicleProfiles() {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: VEHICLE_PROFILES_KEY,
    queryFn: () => routingApi.listVehicleProfiles(accessToken),
  });
}

export function useVehicleProfile(id: string) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: [...VEHICLE_PROFILES_KEY, id],
    queryFn: () => routingApi.getVehicleProfile(accessToken, id),
  });
}

export function useCreateVehicleProfile() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVehicleProfileRequest) =>
      routingApi.createVehicleProfile(accessToken, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: VEHICLE_PROFILES_KEY }),
  });
}

export function useUpdateVehicleProfile() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateVehicleProfileRequest }) =>
      routingApi.updateVehicleProfile(accessToken, id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: VEHICLE_PROFILES_KEY }),
  });
}

export function useDeleteVehicleProfile() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => routingApi.deleteVehicleProfile(accessToken, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: VEHICLE_PROFILES_KEY }),
  });
}
