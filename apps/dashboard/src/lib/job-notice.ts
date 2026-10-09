import type { JobNoticeDto } from '@wagonwise/contracts/jobs';

const time = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/**
 * What the office is told about a driver being told of their job. A push that went is not proof it was read: the better
 * sign is `seenAt`, when the driver first opened the job in the app.
 */
export function noticeText(notice: JobNoticeDto | undefined): { text: string; trouble: boolean } {
  if (notice === undefined || notice.attempts === 0) {
    return { text: 'Driver not notified yet', trouble: true };
  }
  const at = notice.lastAttemptAt === null ? '' : ` at ${time(notice.lastAttemptAt)}`;
  const seen = notice.seenAt === null ? 'not opened yet' : `opened ${time(notice.seenAt)}`;
  switch (notice.result) {
    case 'sent': {
      const phones = notice.devices === 1 ? '1 phone' : `${notice.devices} phones`;
      return { text: `Notified${at} (${phones}), ${seen}`, trouble: notice.seenAt === null };
    }
    case 'no_device':
      return {
        text: `No phone registered for notifications, so nothing could be sent${at}. ${seen}`,
        trouble: true,
      };
    case 'failed':
      return { text: `Notification failed${at}, ${seen}`, trouble: true };
    default:
      return { text: 'Driver not notified yet', trouble: true };
  }
}
