import { pausedCompanyMessage } from './paused-company';

describe('pausedCompanyMessage', () => {
  it('names the firm, says its jobs are off, and says the free app still works', () => {
    const text = pausedCompanyMessage('Acme Haulage');
    expect(text).toContain('Acme Haulage');
    expect(text).toContain('paused');
    expect(text).toContain('jobs are switched off');
    expect(text).toContain('SOS still work');
  });
});
