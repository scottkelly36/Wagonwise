import type { CompanyId, DriverId, JobId } from '../../domain/job.js';
import type {
  DeliveryReport,
  DriverMessage,
  DriverNotifier,
  JobNotice,
  JobNoticeRepository,
  NoticeResult,
} from '../ports/notices.js';

export class FakeDriverNotifier implements DriverNotifier {
  readonly sent: { driverId: DriverId; message: DriverMessage }[] = [];
  report: DeliveryReport = { devices: 1, accepted: 1 };
  throws = false;

  notify(driverId: DriverId, message: DriverMessage): Promise<DeliveryReport> {
    if (this.throws) return Promise.reject(new Error('push service down'));
    this.sent.push({ driverId, message });
    return Promise.resolve(this.report);
  }
}

export class InMemoryNoticeRepository implements JobNoticeRepository {
  private readonly rows = new Map<string, JobNotice>();

  /** Test set-up: a job that exists, with its driver and company. */
  seed(jobId: JobId, companyId: CompanyId, driverId: DriverId): void {
    this.rows.set(jobId, {
      jobId,
      companyId,
      driverId,
      result: null,
      devices: 0,
      attempts: 0,
      lastAttemptAt: null,
      seenAt: null,
    });
  }

  find(jobId: JobId): Promise<JobNotice | null> {
    return Promise.resolve(this.rows.get(jobId) ?? null);
  }

  listWaiting(companyId: CompanyId): Promise<JobNotice[]> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.companyId === companyId));
  }

  record(jobId: JobId, result: NoticeResult, devices: number, at: Date): Promise<void> {
    const row = this.rows.get(jobId);
    if (row !== undefined) {
      this.rows.set(jobId, {
        ...row,
        result,
        devices,
        attempts: row.attempts + 1,
        lastAttemptAt: at,
      });
    }
    return Promise.resolve();
  }

  markSeen(jobId: JobId, at: Date): Promise<void> {
    const row = this.rows.get(jobId);
    if (row !== undefined && row.seenAt === null) this.rows.set(jobId, { ...row, seenAt: at });
    return Promise.resolve();
  }
}
