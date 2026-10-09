import type { JobNoticeDto } from '@wagonwise/contracts/jobs';
import { describe, expect, it } from 'vitest';
import { noticeText } from './job-notice';

const base = {
  jobId: 'j',
  driverId: 'd',
  result: 'sent',
  devices: 1,
  attempts: 1,
  lastAttemptAt: '2026-10-09T09:05:00.000Z',
  seenAt: null,
} as unknown as JobNoticeDto;

describe('noticeText', () => {
  it('reports not notified yet when nothing has been tried', () => {
    expect(noticeText(undefined).trouble).toBe(true);
    expect(noticeText({ ...base, attempts: 0, result: null }).text).toBe('Driver not notified yet');
  });

  it('says a sent notice has not been opened, and flags it until the driver opens the job', () => {
    const sent = noticeText(base);
    expect(sent.text).toMatch(/^Notified at \d\d:\d\d \(1 phone\), not opened yet$/);
    expect(sent.trouble).toBe(true);
    const opened = noticeText({ ...base, seenAt: '2026-10-09T09:20:00.000Z', devices: 2 });
    expect(opened.text).toMatch(/\(2 phones\), opened \d\d:\d\d$/);
    expect(opened.trouble).toBe(false);
  });

  it('says when there is no phone to send to, or the push failed', () => {
    expect(noticeText({ ...base, result: 'no_device', devices: 0 }).text).toMatch(
      /No phone registered/,
    );
    expect(noticeText({ ...base, result: 'failed' }).text).toMatch(/Notification failed/);
  });
});
