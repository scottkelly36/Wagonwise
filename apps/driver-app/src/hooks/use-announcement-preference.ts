import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getAnnouncementPreference, setAnnouncementPreference } from '../api/announcements';
import { useAccessToken } from './use-access-token';

const KEY = ['announcement-preference'] as const;

/**
 * The driver's choice about notifications from WagonWise about what has changed: on unless they turn it off. Shown as on while it loads, since that is the default,
 * and a change shows at once and is put back if the server does not take it.
 */
export function useAnnouncementPreference(): {
  readonly pushes: boolean;
  readonly setPushes: (pushes: boolean) => void;
  readonly failed: boolean;
} {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => getAnnouncementPreference(accessToken),
    enabled: accessToken !== '',
    retry: false,
  });
  const change = useMutation({
    mutationFn: (pushes: boolean) => setAnnouncementPreference(accessToken, pushes),
    onMutate: async (pushes) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const before = queryClient.getQueryData<boolean>(KEY);
      queryClient.setQueryData(KEY, pushes);
      return { before };
    },
    onError: (_error, _pushes, context) => {
      queryClient.setQueryData(KEY, context?.before ?? true);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });
  return {
    pushes: query.data ?? true,
    setPushes: (pushes) => change.mutate(pushes),
    failed: change.isError,
  };
}
