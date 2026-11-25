import { describe, expect, it } from 'vitest';
import { recoveryCodesText } from './recovery-codes';

describe('recoveryCodesText', () => {
  it('lists every code, with who they are for, when they were made and what they are for', () => {
    const text = recoveryCodesText({
      codes: ['AAAA-BBBB', 'CCCC-DDDD'],
      email: 'sam@northern.example',
      companyName: 'Northern Haulage',
      today: '24 November 2026',
    });
    expect(text).toContain('WagonWise recovery codes');
    expect(text).toContain('sam@northern.example, Northern Haulage');
    expect(text).toContain('Made on 24 November 2026');
    expect(text).toContain('Each code works once');
    expect(text.split('\n')).toEqual(expect.arrayContaining(['AAAA-BBBB', 'CCCC-DDDD']));
  });

  it('leaves out the who line when nothing is known', () => {
    const text = recoveryCodesText({ codes: ['AAAA-BBBB'], today: '24 November 2026' });
    expect(text.split('\n')[1]).toBe('Made on 24 November 2026');
  });
});
