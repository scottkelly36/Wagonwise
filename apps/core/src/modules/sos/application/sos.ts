import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { makeId } from '../../../shared/brand.js';
import {
  alertEmail,
  cancelledEmail,
  type CompanyId,
  type DriverId,
  type GeoPoint,
  type SosAlert,
  type SosAlertId,
  type StaffId,
} from '../domain/sos.js';
import type {
  Mailer,
  OfficeContact,
  OfficeContacts,
  DriverSituations,
  SosRepository,
  StaffCaller,
  WordsFor,
} from './ports.js';

export type Forbidden = TaggedError<'Forbidden'>;
export type SosNotFound = TaggedError<'SosNotFound'>;

export interface SosDeps {
  readonly repo: SosRepository;
  readonly situations: DriverSituations;
  readonly words: WordsFor;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  /** How long to wait for the three words before sending without them: the office must not wait on a third party. */
  readonly wordsTimeoutMs?: number | undefined;
}

export interface MailDeps {
  readonly contacts: OfficeContacts;
  readonly mailer: Mailer;
  /** The portal's address, for the link in the email. */
  readonly portalUrl?: string | undefined;
}

const WORDS_TIMEOUT_MS = 3_000;

/** The answer, or `undefined` if it has not come in `ms`. */
async function within<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export interface RaisedSos {
  readonly requestId: string;
  readonly location: GeoPoint;
  readonly words: string | undefined;
  readonly nearestPlace: string | undefined;
  /** The companies told, with what the office was told. Empty for a driver with no company. */
  readonly notified: readonly { readonly companyId: CompanyId; readonly name: string }[];
  /** The alerts made by this call (none on a retry, which tells nobody twice): to be emailed, outside the data scope. */
  readonly made: readonly SosAlert[];
}

/**
 * A driver pressed and held SOS. Finds the three words for where they are (not waiting long for them), works out which companies
 * to tell and what to tell them, and stores one alert for each. A driver with no company stores nothing: the words go back to them
 * to read out. A retry of the same press (same `requestId`) returns what the first made and tells nobody again.
 *
 * Does not email: the office is emailed by `sendAlertEmails`, which must run outside the driver's data scope.
 */
export async function raiseSos(
  deps: SosDeps,
  input: {
    readonly driverId: DriverId;
    readonly identifier: string;
    readonly requestId: string;
    readonly location: GeoPoint;
  },
): Promise<RaisedSos> {
  const earlier = await deps.repo.findByRequest(input.requestId, input.driverId);
  const first = earlier[0];
  if (first !== undefined) {
    const situation = await deps.situations.forDriver(input.driverId, input.identifier);
    const names = new Map(situation.companies.map((c) => [c.id, c.name]));
    return {
      requestId: input.requestId,
      location: first.location,
      words: first.words,
      nearestPlace: first.nearestPlace,
      notified: earlier.map((a) => ({
        companyId: a.companyId,
        name: names.get(a.companyId) ?? 'Your company',
      })),
      made: [],
    };
  }

  const [found, situation] = await Promise.all([
    within(
      deps.words.wordsFor(input.location).catch(() => undefined),
      deps.wordsTimeoutMs ?? WORDS_TIMEOUT_MS,
    ),
    deps.situations.forDriver(input.driverId, input.identifier),
  ]);
  const now = deps.clock.now();
  const made: SosAlert[] = situation.companies.map((company) => ({
    id: makeId<'SosAlertId'>(deps.ids.newId()),
    requestId: input.requestId,
    companyId: company.id,
    driverId: input.driverId,
    driverName: situation.name,
    driverContact: situation.contact,
    vehicleName: company.vehicle?.name,
    vehicleRegistration: company.vehicle?.registration,
    jobReference: company.jobReference,
    location: input.location,
    words: found?.words,
    nearestPlace: found?.nearestPlace,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    resolvedBy: undefined,
    resolvedAt: undefined,
  }));
  if (made.length > 0) await deps.repo.insertAll(made);
  return {
    requestId: input.requestId,
    location: input.location,
    words: found?.words,
    nearestPlace: found?.nearestPlace,
    notified: situation.companies.map((c) => ({ companyId: c.id, name: c.name })),
    made,
  };
}

/** Who at a company to email: the people who dispatch, and if the company has none, everyone it has, so it never goes nowhere. */
function recipientsOf(contacts: readonly OfficeContact[]): readonly OfficeContact[] {
  const dispatchers = contacts.filter((c) => c.privileges.includes('dispatch'));
  return dispatchers.length > 0 ? dispatchers : contacts;
}

async function emailOffice(
  mail: MailDeps,
  alert: SosAlert,
  content: { subject: string; text: string },
): Promise<{ sent: number; failed: number }> {
  let contacts: readonly OfficeContact[];
  try {
    contacts = await mail.contacts.forCompany(alert.companyId);
  } catch {
    return { sent: 0, failed: 1 };
  }
  const results = await Promise.allSettled(
    recipientsOf(contacts).map((c) => mail.mailer.send(c.email, content.subject, content.text)),
  );
  const sent = results.filter((r) => r.status === 'fulfilled').length;
  return { sent, failed: results.length - sent };
}

/**
 * Emails each company's office about the alerts a press made. One person's email failing does not stop the rest, and nothing here
 * can fail the SOS itself: the alert is already stored and shows in the portal. Says how many went and how many did not.
 */
export async function sendAlertEmails(
  mail: MailDeps,
  made: readonly SosAlert[],
): Promise<{ sent: number; failed: number }> {
  const results = await Promise.all(
    made.map((alert) => emailOffice(mail, alert, alertEmail(alert, mail.portalUrl))),
  );
  return {
    sent: results.reduce((n, r) => n + r.sent, 0),
    failed: results.reduce((n, r) => n + r.failed, 0),
  };
}

/** The driver says it was a mistake or they are all right. Their still-open alerts are cancelled; returns them, to be emailed. */
export async function cancelSos(
  deps: Pick<SosDeps, 'repo' | 'clock'>,
  input: { readonly driverId: DriverId; readonly requestId: string },
): Promise<readonly SosAlert[]> {
  return deps.repo.cancelRequest(input.requestId, input.driverId, deps.clock.now());
}

export async function sendCancelledEmails(
  mail: MailDeps,
  cancelled: readonly SosAlert[],
): Promise<{ sent: number; failed: number }> {
  const results = await Promise.all(
    cancelled.map((alert) => emailOffice(mail, alert, cancelledEmail(alert))),
  );
  return {
    sent: results.reduce((n, r) => n + r.sent, 0),
    failed: results.reduce((n, r) => n + r.failed, 0),
  };
}

const LIST_LIMIT = 100;

/** The company's alerts, for its own staff: the open ones, or all. WagonWise staff have no company here and are not offered them. */
export async function listSos(
  deps: Pick<SosDeps, 'repo'>,
  input: { readonly actor: StaffCaller; readonly status: 'open' | 'all' },
): Promise<Result<SosAlert[], Forbidden>> {
  if (input.actor.kind !== 'fleet') return err({ tag: 'Forbidden' });
  return ok(await deps.repo.listForCompany(input.actor.companyId, input.status, LIST_LIMIT));
}

/** Someone in the office says an alert has been dealt with. Needs the dispatch privilege, and the alert must be the company's. */
export async function resolveSos(
  deps: Pick<SosDeps, 'repo' | 'clock'>,
  input: { readonly actor: StaffCaller; readonly staffId: StaffId; readonly id: SosAlertId },
): Promise<Result<void, Forbidden | SosNotFound>> {
  if (input.actor.kind !== 'fleet') return err({ tag: 'Forbidden' });
  if (!input.actor.privileges.includes('dispatch')) return err({ tag: 'Forbidden' });
  const alert = await deps.repo.findById(input.id);
  if (alert === null || alert.companyId !== input.actor.companyId)
    return err({ tag: 'SosNotFound' });
  if (alert.status === 'open') await deps.repo.resolve(alert.id, input.staffId, deps.clock.now());
  return ok(undefined);
}

/** Housekeeping: deletes closed alerts older than `retentionDays`. Open ones stay until someone deals with them. */
export async function pruneClosedSos(
  deps: Pick<SosDeps, 'repo' | 'clock'>,
  retentionDays: number,
): Promise<number> {
  const cutoff = new Date(deps.clock.now().getTime() - retentionDays * 24 * 60 * 60 * 1000);
  return deps.repo.deleteClosedBefore(cutoff);
}
