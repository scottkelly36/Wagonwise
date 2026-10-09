import { assignedJobIdFrom } from './job-notification';

describe('assignedJobIdFrom', () => {
  it('reads the job id from a job-assigned notification', () => {
    expect(assignedJobIdFrom({ type: 'job_assigned', jobId: 'job-1' })).toBe('job-1');
  });

  it('ignores anything else, including a reroute notification', () => {
    expect(assignedJobIdFrom({ newRoutePlanId: 'plan-1' })).toBeUndefined();
    expect(assignedJobIdFrom({ type: 'job_assigned' })).toBeUndefined();
    expect(assignedJobIdFrom({ type: 'job_assigned', jobId: '' })).toBeUndefined();
    expect(assignedJobIdFrom(null)).toBeUndefined();
    expect(assignedJobIdFrom('job-1')).toBeUndefined();
  });
});
