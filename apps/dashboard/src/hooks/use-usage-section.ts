import type { UsageSectionName } from '@wagonwise/contracts/usage';
import { useQuery } from '@tanstack/react-query';
import * as usageApi from '../api/usage';
import { useStaffAuthStore } from '../state/staff-auth-store';

const MINUTE = 60_000;

/**
 * One view of the usage page. It is fetched only while that view is open, so opening the page costs one view, not all of them; a view
 * already seen is shown straight away when it is opened again and refreshed in the background.
 */
export function useUsageSection<S extends UsageSectionName>(section: S) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  return useQuery({
    queryKey: ['usage', section],
    queryFn: () => withAccessToken((token) => usageApi.getUsageSection(token, section)),
    staleTime: MINUTE,
    refetchInterval: 5 * MINUTE,
  });
}
