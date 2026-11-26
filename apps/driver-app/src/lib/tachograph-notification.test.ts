import { isTachographReminder } from './tachograph-notification';

describe('isTachographReminder', () => {
  it('recognises the reminder', () => {
    expect(isTachographReminder({ type: 'tachograph_due' })).toBe(true);
  });

  it('ignores everything else', () => {
    expect(isTachographReminder({ type: 'job_assigned', jobId: 'j1' })).toBe(false);
    expect(isTachographReminder({})).toBe(false);
    expect(isTachographReminder(null)).toBe(false);
    expect(isTachographReminder('tachograph_due')).toBe(false);
    expect(isTachographReminder(undefined)).toBe(false);
  });
});
