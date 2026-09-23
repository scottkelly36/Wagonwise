import { QueryClient } from '@tanstack/react-query';

// One client for the whole app, per TanStack Query's own recommendation — created once at
// module scope, not per-render, so it survives navigation and Fast Refresh.
export const queryClient = new QueryClient();
