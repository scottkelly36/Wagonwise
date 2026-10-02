import type { JobStatus } from '@wagonwise/contracts/jobs';

/** Plain words for the status line on the job screen — not shown as a button label. */
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Not yet assigned',
  assigned: 'Assigned to you',
  accepted: 'Accepted',
  at_pickup: 'At pickup',
  loaded: 'Loaded',
  en_route: 'En route',
  at_delivery: 'At delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

/** One big button per step (design doc §5): "Arrived at pickup" → "Loaded" → "Set off" →
 *  "Arrived" → "Delivered". `assigned` isn't itself in that list; "Accept job" is the natural
 *  step before it starts. Presentation only — core's `advanceStatus` is what actually validates a
 *  transition, so a status missing here just means there's nothing for the driver to tap yet. */
export const NEXT_STEP: Partial<
  Record<JobStatus, { readonly to: JobStatus; readonly label: string }>
> = {
  assigned: { to: 'accepted', label: 'Accept job' },
  accepted: { to: 'at_pickup', label: 'Arrived at pickup' },
  at_pickup: { to: 'loaded', label: 'Loaded' },
  loaded: { to: 'en_route', label: 'Set off' },
  en_route: { to: 'at_delivery', label: 'Arrived' },
  at_delivery: { to: 'delivered', label: 'Delivered' },
};
