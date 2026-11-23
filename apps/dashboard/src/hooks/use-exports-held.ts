import { useQuery } from '@tanstack/react-query';

import * as companiesApi from '../api/companies';
import { isPlatform } from '../state/access';
import { useStaffAuthStore } from '../state/staff-auth-store';

/**
 * True while the signed-in staff member's company is paused: its download and print buttons are hidden (docs/company-account-states-
 * scope.md). The server cannot tell a download from a view (the files are built here from the same reads as the pages), so this is
 * a nudge, not a lock. It shares the banner's query, so it costs no extra request. WagonWise staff are never held, and while the
 * state is loading or could not be read nothing is hidden.
 */
export function useExportsHeld(): boolean {
  const staff = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const state = useQuery({
    queryKey: ['own-account-state'],
    queryFn: () => withAccessToken((token) => companiesApi.getOwnAccountState(token)),
    enabled: staff !== undefined && !isPlatform(staff),
    retry: false,
    select: (s) => s.status === 'paused',
  });
  return state.data === true;
}
