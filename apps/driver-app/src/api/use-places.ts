import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import type {
  MarkPlaceRequest,
  SavedPlaceDto,
  UpdatePlaceRequest,
} from '@wagonwise/contracts/places';
import { companyIdSchema } from '@wagonwise/contracts/companies';
import { useMemo } from 'react';

import { useAccessToken } from '../hooks/use-access-token';
import { useCurrentJob } from './use-jobs';
import { useMyLinks } from './use-fleet';
import { markingCompanyIdFor } from '../lib/places';
import * as placesApi from './places';

const PLACES_KEY = ['places'] as const;
const PLACES_STALE_MS = 2 * 60_000;

export interface MyPlaces {
  readonly places: SavedPlaceDto[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  /** The company a new place would belong to, or undefined for a personal one. */
  readonly markingCompanyId: string | undefined;
  /** True when a place marked now would be shared with a company. */
  readonly shared: boolean;
}

/**
 * Every saved place the driver can see: those of each company they drive for, and their own personal
 * ones, together. The job's company counts even before the links list has loaded.
 */
export function useMyPlaces(): MyPlaces {
  const accessToken = useAccessToken();
  const links = useMyLinks();
  const job = useCurrentJob();
  const activeCompanyIds = useMemo(
    () => [
      ...new Set([
        ...(links.data?.filter((l) => l.status === 'active').map((l) => l.companyId) ?? []),
        ...(job.data ? [job.data.companyId] : []),
      ]),
    ],
    [links.data, job.data],
  );

  // One query for each company, and one for the personal places (no company).
  const scopes: (string | undefined)[] = [...activeCompanyIds, undefined];
  const results = useQueries({
    queries: scopes.map((companyId) => ({
      queryKey: [...PLACES_KEY, companyId ?? 'me'],
      queryFn: () =>
        placesApi.listPlaces(
          accessToken,
          companyId === undefined ? {} : { companyId: companyIdSchema.parse(companyId) },
        ),
      staleTime: PLACES_STALE_MS,
    })),
  });

  // A new array only when some query has new data, so screens using it do not redraw on every render.
  const updatedAt = results.map((r) => r.dataUpdatedAt).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const places = useMemo(() => results.flatMap((r) => r.data ?? []), [updatedAt]);
  const markingCompanyId = markingCompanyIdFor(
    job.data?.companyId,
    links.data?.filter((l) => l.status === 'active').map((l) => l.companyId) ?? [],
  );
  return {
    places,
    isLoading: results.some((r) => r.isPending),
    isError: results.every((r) => r.isError),
    markingCompanyId,
    shared: markingCompanyId !== undefined,
  };
}

export function useMarkPlace() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MarkPlaceRequest) => placesApi.markPlace(accessToken, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PLACES_KEY }),
  });
}

export function useUpdatePlace() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdatePlaceRequest) =>
      placesApi.updatePlace(accessToken, id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PLACES_KEY }),
  });
}

export function useSharePlace() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, companyId }: { id: string; companyId: string }) =>
      placesApi.sharePlace(accessToken, id, companyId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PLACES_KEY }),
  });
}

export function useDeletePlace() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => placesApi.deletePlace(accessToken, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PLACES_KEY }),
  });
}
