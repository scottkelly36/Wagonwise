import { WALKTHROUGH_CLOSING, WALKTHROUGH_STEPS } from './walkthrough-steps';

describe('walkthrough steps', () => {
  it('is a short tour: a few steps, each with a title and a body', () => {
    expect(WALKTHROUGH_STEPS.length).toBeGreaterThanOrEqual(3);
    expect(WALKTHROUGH_STEPS.length).toBeLessThanOrEqual(5);
    for (const step of WALKTHROUGH_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });

  it('uses no em dashes (a tester said they look unprofessional)', () => {
    const text = [...WALKTHROUGH_STEPS.flatMap((s) => [s.title, s.body]), WALKTHROUGH_CLOSING];
    for (const line of text) expect(line).not.toContain('—');
  });
});
