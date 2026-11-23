import type { PortalEventDto } from '@wagonwise/contracts/usage';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { acceptableTime } from '../domain/flow-event.js';
import type { PortalEvent } from '../domain/portal-event.js';
import type { StaffCaller } from './usage.js';

/** Where portal events are kept. */
export interface PortalEventRepository {
  insert(events: readonly PortalEvent[]): Promise<void>;
  /** Deletes events that happened before `cutoff`, and says how many. */
  deleteBefore(cutoff: Date): Promise<number>;
}

export interface PortalEventDeps {
  readonly repo: PortalEventRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/**
 * Stores a batch from one sitting in the portal, and returns how many were kept. The company is the signed-in person's own, never
 * taken from the request; the person is not stored. WagonWise's own staff have no company and are not tracked (their clicks would
 * only muddy the picture of how companies use the portal), so nothing is kept for them. An event whose time is not believable
 * (`acceptableTime`) is left out.
 */
export async function recordPortalEvents(
  deps: PortalEventDeps,
  caller: StaffCaller,
  input: { readonly sessionId: string; readonly events: readonly PortalEventDto[] },
): Promise<number> {
  if (caller.kind !== 'fleet') return 0;
  const now = deps.clock.now();
  const kept: PortalEvent[] = input.events.flatMap((e) => {
    const at = new Date(e.at);
    if (!acceptableTime(at, now)) return [];
    return [
      {
        id: deps.ids.newId(),
        companyId: caller.companyId,
        sessionId: input.sessionId,
        event: e.event,
        page: e.event === 'page_viewed' ? e.page : undefined,
        form: e.event === 'page_viewed' ? undefined : e.form,
        field: e.event === 'form_error' ? e.field : undefined,
        problem: e.event === 'form_error' ? e.problem : undefined,
        at,
      },
    ];
  });
  if (kept.length > 0) await deps.repo.insert(kept);
  return kept.length;
}
