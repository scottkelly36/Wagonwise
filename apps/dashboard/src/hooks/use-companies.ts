import { useQuery } from '@tanstack/react-query';

import * as companiesApi from '../api/companies';
import { useStaffAuthStore } from '../state/staff-auth-store';

/** Same key every page that lists companies uses, so they share one fetch. */
export const COMPANIES_KEY = ['companies'] as const;

/**
 * Every company, for WagonWise staff only (core refuses anyone else). Pass `enabled: false` for
 * a signed-in person who is not WagonWise staff, so nothing is requested for them.
 */
export function useCompanies(enabled: boolean) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  return useQuery({
    queryKey: COMPANIES_KEY,
    queryFn: () => withAccessToken((token) => companiesApi.listCompanies(token)),
    enabled,
  });
}
