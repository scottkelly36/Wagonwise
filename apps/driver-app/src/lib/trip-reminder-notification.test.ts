import { tripReminderIdFrom } from './trip-reminder-notification';

describe('tripReminderIdFrom', () => {
  it('reads the trip’s id from a trip reminder', () => {
    expect(tripReminderIdFrom({ type: 'trip-reminder', tripId: 't1' })).toBe('t1');
  });

  it('ignores every other kind of notification, and anything malformed', () => {
    expect(tripReminderIdFrom({ type: 'announcement', announcementId: 'a1' })).toBeUndefined();
    expect(tripReminderIdFrom({ newRoutePlanId: 'p1' })).toBeUndefined();
    expect(tripReminderIdFrom({ type: 'trip-reminder' })).toBeUndefined();
    expect(tripReminderIdFrom({ type: 'trip-reminder', tripId: '' })).toBeUndefined();
    expect(tripReminderIdFrom({ type: 'trip-reminder', tripId: 5 })).toBeUndefined();
    expect(tripReminderIdFrom(null)).toBeUndefined();
    expect(tripReminderIdFrom(undefined)).toBeUndefined();
  });
});
