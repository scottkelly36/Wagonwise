import type {
  PortalEventDto,
  PortalEventsRequest,
  PortalForm,
  PortalPage,
  PortalProblem,
} from '@wagonwise/contracts/usage';
import { MAX_PORTAL_EVENTS_PER_REQUEST } from '@wagonwise/contracts/usage';

/** The paths of the portal's pages (a company's staff, not WagonWise's own admin pages) and the page each is. The longest match wins. */
const PAGE_PATHS: readonly (readonly [string, PortalPage])[] = [
  ['/fleet', 'fleet_overview'],
  ['/fleet/jobs', 'jobs'],
  ['/fleet/live-trips', 'live_trips'],
  ['/fleet/fuel', 'fuel'],
  ['/fleet/costs', 'costs'],
  ['/fleet/job-costs', 'job_costs'],
  ['/fleet/outlook', 'outlook'],
  ['/fleet/places', 'places'],
  ['/fleet/checks', 'checks'],
  ['/fleet/maintenance', 'maintenance'],
  ['/fleet/check-results', 'check_results'],
  ['/fleet/defects', 'defects'],
  ['/fleet/audit-pack', 'audit_pack'],
  ['/fleet/reports', 'reports'],
  ['/fleet/drivers', 'drivers'],
  ['/fleet/vehicle-profiles', 'vehicle_profiles'],
  ['/guide', 'guide'],
  ['/staff/users', 'users'],
  ['/staff/activity', 'activity'],
  ['/staff/settings', 'settings'],
  ['/staff/plan', 'plan'],
];

/** The page at a path, or undefined for one that is not tracked (the sign-in, WagonWise's admin pages, anything unknown). Never the query. */
export function pageForPath(pathname: string): PortalPage | undefined {
  let best: { page: PortalPage; length: number } | undefined;
  for (const [path, page] of PAGE_PATHS) {
    // The overview is only /fleet itself; the pages beneath /fleet each have their own entry.
    const here = pathname === path || (path !== '/fleet' && pathname.startsWith(`${path}/`));
    if (here && (best === undefined || path.length > best.length)) {
      best = { page, length: path.length };
    }
  }
  return best?.page;
}

/** What kind of problem a refused request was, from the error's tag. Anything unfamiliar is `other`: never the message. */
export function problemFromTag(tag: string | undefined): PortalProblem {
  switch (tag) {
    case 'CapacityReached':
      return 'capacity_reached';
    case 'Forbidden':
    case 'PrivilegeNotHeld':
    case 'AccountPaused':
    case 'NotAFleetUser':
      return 'not_allowed';
    default:
      return 'other';
  }
}

const MAX_QUEUE = 200;

export interface PortalTrackerDeps {
  /** Sends one batch. Rejects when it could not be sent. */
  readonly send: (request: PortalEventsRequest, keepalive: boolean) => Promise<unknown>;
  readonly now: () => Date;
  readonly newId: () => string;
}

/**
 * What a company's staff do in the portal, as names from fixed lists: a page opened, a form started, sent, left part-way, or a problem
 * it showed (docs/company-account-states-scope.md, "Portal tracking"). Held in memory and sent in small batches; sending never blocks
 * a screen and a failure is silent. The session id is made here, in memory, when the portal opens and is gone when it closes. Nothing
 * a person typed ever reaches this class: only the form, the field and a kind of problem.
 */
export class PortalTracker {
  readonly sessionId: string;
  #queue: PortalEventDto[] = [];
  /** Forms started and neither sent nor left yet. */
  readonly #open = new Set<PortalForm>();
  #enabled = false;
  #sending = false;

  constructor(private readonly deps: PortalTrackerDeps) {
    this.sessionId = deps.newId();
  }

  /** Off for WagonWise's own staff and when nobody is signed in: nothing is recorded. Turning it off drops what was waiting. */
  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (!enabled) {
      this.#queue = [];
      this.#open.clear();
    }
  }

  get pending(): number {
    return this.#queue.length;
  }

  page(page: PortalPage): void {
    // The same page announced twice in a moment (a page that renders twice as it starts) is one view.
    const last = this.#queue[this.#queue.length - 1];
    const at = this.#at();
    if (
      last?.event === 'page_viewed' &&
      last.page === page &&
      Date.parse(at) - Date.parse(last.at) < 1000
    ) {
      return;
    }
    this.#push({ event: 'page_viewed', page, at });
  }

  /** The first thing typed into a form: it counts as opened. Later calls while it stays open do nothing. */
  formTouched(form: PortalForm): void {
    if (!this.#enabled || this.#open.has(form)) return;
    this.#open.add(form);
    this.#push({ event: 'form_opened', form, at: this.#at() });
  }

  formSent(form: PortalForm): void {
    this.formTouched(form);
    this.#open.delete(form);
    this.#push({ event: 'form_sent', form, at: this.#at() });
  }

  formProblem(form: PortalForm, field: string, problem: PortalProblem): void {
    this.formTouched(form);
    this.#push({ event: 'form_error', form, field, problem, at: this.#at() });
  }

  /** The form went away (the page changed) or the portal is closing: if it was started and not sent, that is a form left part-way. */
  formLeft(form: PortalForm): void {
    if (!this.#open.delete(form)) return;
    this.#push({ event: 'form_left', form, at: this.#at() });
  }

  /** The portal is closing: every form still open was left. */
  leaveAllForms(): void {
    for (const form of [...this.#open]) this.formLeft(form);
  }

  /** Sends what is waiting, at most one batch at a time and at most 50 events in it. A failure puts the batch back unless it was refused. */
  async flush(keepalive = false): Promise<void> {
    if (!this.#enabled || this.#sending || this.#queue.length === 0) return;
    this.#sending = true;
    const batch = this.#queue.slice(0, MAX_PORTAL_EVENTS_PER_REQUEST);
    this.#queue = this.#queue.slice(batch.length);
    try {
      await this.deps.send({ sessionId: this.sessionId, events: batch }, keepalive);
    } catch (error) {
      const refused =
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        typeof error.status === 'number' &&
        error.status >= 400 &&
        error.status < 500;
      // Refused (a 4xx) will be refused again: drop it. Anything else (no network) may work next time, if there is room.
      if (!refused && this.#queue.length + batch.length <= MAX_QUEUE) {
        this.#queue = [...batch, ...this.#queue];
      }
    } finally {
      this.#sending = false;
    }
  }

  #at(): string {
    return this.deps.now().toISOString();
  }

  #push(event: PortalEventDto): void {
    if (!this.#enabled) return;
    this.#queue.push(event);
    // A long time offline: keep the newest.
    if (this.#queue.length > MAX_QUEUE) this.#queue = this.#queue.slice(-MAX_QUEUE);
  }
}
