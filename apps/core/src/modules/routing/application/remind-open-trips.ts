import type { Clock } from '../../../shared/ports/clock.js';
import type { IdentityModule } from '../../identity/api.js';
import { reminderDue } from '../domain/trip-reminder.js';
import { ABANDONED_TRIP_AGE_MS } from './housekeeping.js';
import type { ActiveTripRepository } from './ports/active-trip-repository.js';
import type { PushNotification, PushNotifier } from './ports/push-notifier.js';

export interface RemindOpenTripsDeps {
  readonly activeTripRepo: ActiveTripRepository;
  readonly identity: Pick<IdentityModule, 'getPushTokensForDriver'>;
  readonly pushNotifier: PushNotifier;
  readonly clock: Clock;
}

/** Tapping it opens the app, which brings back a running trip on the trip screen, where End trip is. */
export function tripReminder(tripId: string): PushNotification {
  return {
    title: 'Still on your trip?',
    body: 'If you have arrived, open WagonWise and tap End trip, so your next route starts fresh.',
    data: { type: 'trip-reminder', tripId },
    quiet: true,
  };
}

/**
 * Sends one quiet reminder for each trip still running two hours after its planned arrival (`reminderDue`), and returns how
 * many trips were reminded. A trip is marked before its push goes out, so it is never reminded twice, even if a push fails.
 * Trips over a day old are left to `endAbandonedTrips`. Run on a timer by composition.
 */
export async function remindOpenTrips(deps: RemindOpenTripsDeps): Promise<number> {
  const now = deps.clock.now();
  const candidates = await deps.activeTripRepo.findReminderCandidates(
    new Date(now.getTime() - ABANDONED_TRIP_AGE_MS),
  );
  let reminded = 0;
  for (const { trip, plannedDurationMin } of candidates) {
    if (!reminderDue(trip.startedAt, plannedDurationMin, now)) continue;
    if (!(await deps.activeTripRepo.markReminded(trip.id, now))) continue;
    reminded += 1;
    const tokens = await deps.identity.getPushTokensForDriver(trip.driverId);
    for (const token of tokens) await deps.pushNotifier.send(token, tripReminder(trip.id));
  }
  return reminded;
}
