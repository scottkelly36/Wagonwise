import type { CompanyId, DriverId, JobId } from '../../domain/job.js';

export type NoticeResult = 'sent' | 'no_device' | 'failed';

export interface DriverMessage {
  readonly title: string;
  readonly body: string;
  /** Carries what the app needs to open the right job. */
  readonly data: { readonly type: 'job_assigned'; readonly jobId: string };
}

export interface DeliveryReport {
  /** Phones the driver has registered for notifications. */
  readonly devices: number;
  /** How many of them the push service accepted. */
  readonly accepted: number;
}

/**
 * Sends a push notification to every phone a driver has registered. Supplied by composition over identity's device
 * list and the push service; jobs never reaches into either (AGENTS.md rule 7). A refused push is a lower `accepted`,
 * not an error; only the service being unreachable throws.
 */
export interface DriverNotifier {
  notify(driverId: DriverId, message: DriverMessage): Promise<DeliveryReport>;
}

/** What happened when the driver was told about a job, as the office sees it. */
export interface JobNotice {
  readonly jobId: JobId;
  readonly companyId: CompanyId;
  readonly driverId: DriverId;
  readonly result: NoticeResult | null;
  readonly devices: number;
  readonly attempts: number;
  readonly lastAttemptAt: Date | null;
  readonly seenAt: Date | null;
}

export interface JobNoticeRepository {
  find(jobId: JobId): Promise<JobNotice | null>;
  /** Jobs of the company that are assigned and not yet accepted. */
  listWaiting(companyId: CompanyId): Promise<JobNotice[]>;
  /** Notes one attempt. */
  record(jobId: JobId, result: NoticeResult, devices: number, at: Date): Promise<void>;
  /** Notes the first time the driver opened the job; later opens change nothing. */
  markSeen(jobId: JobId, at: Date): Promise<void>;
}
