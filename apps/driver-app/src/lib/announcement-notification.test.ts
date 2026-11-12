import { announcementIdFrom } from './announcement-notification';

describe('announcementIdFrom', () => {
  it('reads the note’s id from a news notification', () => {
    expect(announcementIdFrom({ type: 'announcement', announcementId: 'a1' })).toBe('a1');
  });

  it('ignores every other kind of notification, and anything malformed', () => {
    expect(announcementIdFrom({ type: 'job_assigned', jobId: 'j1' })).toBeUndefined();
    expect(announcementIdFrom({ type: 'announcement' })).toBeUndefined();
    expect(announcementIdFrom({ type: 'announcement', announcementId: '' })).toBeUndefined();
    expect(announcementIdFrom({ type: 'announcement', announcementId: 5 })).toBeUndefined();
    expect(announcementIdFrom(null)).toBeUndefined();
    expect(announcementIdFrom('announcement')).toBeUndefined();
    expect(announcementIdFrom(undefined)).toBeUndefined();
  });
});
