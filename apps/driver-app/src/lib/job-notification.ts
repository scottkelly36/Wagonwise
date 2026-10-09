/**
 * Pulls the job id out of a "job assigned" push notification's `data` payload (core's `job-notices.ts` sends
 * `data: { type: 'job_assigned', jobId }`). A plain function so the shape check is unit-testable without a real
 * `expo-notifications` event, like `reroute-notification.ts`.
 */
export function assignedJobIdFrom(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const record = data as Record<string, unknown>;
  return record.type === 'job_assigned' && typeof record.jobId === 'string' && record.jobId !== ''
    ? record.jobId
    : undefined;
}
