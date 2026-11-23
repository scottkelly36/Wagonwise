import type { ReactNode } from 'react';
import { ErrorNotice } from '../../../components/ErrorNotice';
import { HomeNote } from '../../../components/HomeParts';

/** Loading and error states for a view, then its content. */
export function ViewState<T>({
  query,
  children,
}: {
  query: { data: T | undefined; isError: boolean; error: unknown };
  children: (data: T) => ReactNode;
}) {
  if (query.isError && query.data === undefined) return <ErrorNotice error={query.error} />;
  if (query.data === undefined) return <HomeNote>Loading…</HomeNote>;
  return <>{children(query.data)}</>;
}
