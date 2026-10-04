import { jobEntry } from './job-entry';

describe('jobEntry', () => {
  it('shows the job when there is one', () => {
    expect(jobEntry({ isPending: false, isError: false, data: { reference: 'JOB-7' } })).toEqual({
      kind: 'job',
      reference: 'JOB-7',
    });
  });

  it('keeps showing the job when the latest check failed', () => {
    expect(jobEntry({ isPending: false, isError: true, data: { reference: 'JOB-7' } })).toEqual({
      kind: 'job',
      reference: 'JOB-7',
    });
  });

  it('says it is checking while the first answer is awaited', () => {
    expect(jobEntry({ isPending: true, isError: false, data: undefined })).toEqual({
      kind: 'checking',
    });
  });

  it('says it could not check, rather than that there is no job, when the request failed', () => {
    expect(jobEntry({ isPending: false, isError: true, data: undefined })).toEqual({
      kind: 'error',
    });
  });

  it('says there is no job only when the server answered that there is none', () => {
    expect(jobEntry({ isPending: false, isError: false, data: null })).toEqual({ kind: 'none' });
  });
});
