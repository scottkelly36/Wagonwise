import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateVehicleProfileRequest } from '@wagonwise/contracts/routing';

import { useAccessToken } from '../hooks/use-access-token';
import * as routingApi from './routing';

const VEHICLE_PROFILES_KEY = ['vehicle-profiles'] as const;

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
