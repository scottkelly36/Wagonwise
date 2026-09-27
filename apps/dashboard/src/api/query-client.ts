import { QueryClient } from '@tanstack/react-query';

// One client for the whole app, per TanStack Query's own recommendation — mirrors driver-app's
// own `api/query-client.ts` exactly.
export const queryClient = new QueryClient();
