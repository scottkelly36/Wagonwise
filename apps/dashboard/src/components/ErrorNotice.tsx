import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { staffErrorMessage } from '../pages/staff/messages';

/**
 * A failed call, in plain words. When something that was loading has failed (not just a button's action), it also offers
 * **Try again**, which asks for everything that failed to load once more.
 */
export function ErrorNotice({ error }: { error: unknown }) {
  const queryClient = useQueryClient();
  const fetching = useIsFetching() > 0;
  const loadFailed =
    queryClient.getQueryCache().findAll({ predicate: (q) => q.state.status === 'error' }).length >
    0;

  return (
    <p className="error" role="alert">
      {staffErrorMessage(error)}
      {loadFailed && (
        <>
          {' '}
          <button
            type="button"
            className="btn-quiet"
            disabled={fetching}
            onClick={() => {
              void queryClient.refetchQueries({ predicate: (q) => q.state.status === 'error' });
            }}
          >
            {fetching ? 'Trying…' : 'Try again'}
          </button>
        </>
      )}
    </p>
  );
}
