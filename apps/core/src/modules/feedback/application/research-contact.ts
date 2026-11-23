import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import { mayContact, type ResearchConsent } from '../domain/research-consent.js';
import type { ResearchConsentRepository } from './ports/research-consent-repository.js';
import type { Forbidden, StaffCaller } from './review-feedback.js';

/** The option is switched off, so no answer is taken. */
export type NotAvailable = TaggedError<'NotAvailable'>;
/** The wording the person answered is not the wording that applies now (it changed while the page was open). */
export type WordingChanged = TaggedError<'WordingChanged'>;

/** Supplied by composition over `companies`: who a staff member is, for WagonWise staff reading the list. Removed accounts are absent. */
export interface StaffLabels {
  describe(
    staffIds: readonly string[],
  ): Promise<
    ReadonlyMap<
      string,
      { readonly name: string; readonly email: string; readonly companyName: string }
    >
  >;
}

export interface ResearchContactDeps {
  readonly repo: ResearchConsentRepository;
  readonly labels: StaffLabels;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Whether the option is on at all. It starts off, until the solicitor has seen the wording. */
  readonly enabled: boolean;
  /** The version of the wording that applies now (packages/contracts RESEARCH_CONTACT_WORDING). */
  readonly wordingVersion: number;
}

export interface MyResearchContact {
  readonly available: boolean;
  /** Their latest answer to the current wording; null if they have not answered it. */
  readonly agreed: boolean | null;
  readonly at: Date | null;
}

/** A company's own staff only: WagonWise's staff have no company and are never asked. */
function fleetCaller(caller: StaffCaller): { companyId: string } | undefined {
  return caller.kind === 'fleet' ? { companyId: caller.companyId } : undefined;
}

export async function getMyResearchContact(
  deps: ResearchContactDeps,
  caller: StaffCaller,
  staffId: string,
): Promise<Result<MyResearchContact, Forbidden>> {
  if (fleetCaller(caller) === undefined) return err({ tag: 'Forbidden' });
  if (!deps.enabled) return ok({ available: false, agreed: null, at: null });
  const latest = await deps.repo.latest(staffId);
  const current = latest !== null && latest.wordingVersion === deps.wordingVersion;
  return ok({
    available: true,
    agreed: current ? latest.agreed : null,
    at: current ? latest.at : null,
  });
}

/** Records the person's answer, to the wording they were shown. Yes or no, as often as they like: each is a new row. */
export async function setMyResearchContact(
  deps: ResearchContactDeps,
  caller: StaffCaller,
  staffId: string,
  input: { readonly agreed: boolean; readonly version: number },
): Promise<Result<MyResearchContact, Forbidden | NotAvailable | WordingChanged>> {
  const fleet = fleetCaller(caller);
  if (fleet === undefined) return err({ tag: 'Forbidden' });
  if (!deps.enabled) return err({ tag: 'NotAvailable' });
  if (input.version !== deps.wordingVersion) return err({ tag: 'WordingChanged' });
  const consent: ResearchConsent = {
    id: deps.ids.newId(),
    staffId,
    companyId: fleet.companyId,
    agreed: input.agreed,
    wordingVersion: deps.wordingVersion,
    at: deps.clock.now(),
  };
  await deps.repo.add(consent);
  return ok({ available: true, agreed: consent.agreed, at: consent.at });
}

export interface ResearchContactPerson {
  readonly name: string;
  readonly email: string;
  readonly company: string;
  readonly at: Date;
}

/**
 * The people WagonWise may contact for research: latest answer yes, given to the current wording, and the account still exists. WagonWise
 * staff only. Nobody else is on it, so nobody is contacted without having said yes.
 */
export async function listResearchContacts(
  deps: ResearchContactDeps,
  caller: StaffCaller,
): Promise<Result<{ available: boolean; people: ResearchContactPerson[] }, Forbidden>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  if (!deps.enabled) return ok({ available: false, people: [] });
  const agreed = (await deps.repo.latestAgreed()).filter((c) => mayContact(c, deps.wordingVersion));
  const labels = await deps.labels.describe(agreed.map((c) => c.staffId));
  const people = agreed.flatMap((c) => {
    const who = labels.get(c.staffId);
    return who === undefined
      ? []
      : [{ name: who.name, email: who.email, company: who.companyName, at: c.at }];
  });
  return ok({ available: true, people });
}
