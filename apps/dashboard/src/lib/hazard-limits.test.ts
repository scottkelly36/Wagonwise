import { describe, expect, it } from 'vitest';

import { measurementProblem } from './hazard-limits';

describe('measurementProblem', () => {
  it('accepts a real height, width and weight, and an empty box', () => {
    expect(measurementProblem('height', '4.19')).toBeUndefined();
    expect(measurementProblem('height', '7')).toBeUndefined();
    expect(measurementProblem('width', '2.5')).toBeUndefined();
    expect(measurementProblem('weight', '7.5')).toBeUndefined();
    expect(measurementProblem('height', '')).toBeUndefined();
    expect(measurementProblem('height', '  ')).toBeUndefined();
  });

  it('stops a height typed in feet, such as 13.9 for 13 ft 9 in, and says what to type', () => {
    expect(measurementProblem('height', '13.9')).toContain('13 ft 9 in is 4.19');
    expect(measurementProblem('height', '7.1')).toBeDefined();
  });

  it('stops a width or weight no sign could carry', () => {
    expect(measurementProblem('width', '9')).toContain('too wide');
    expect(measurementProblem('weight', '150')).toContain('too heavy');
  });

  it('stops a number that is not above zero', () => {
    expect(measurementProblem('height', 'abc')).toBe('Enter a number above zero.');
    expect(measurementProblem('height', '0')).toBe('Enter a number above zero.');
    expect(measurementProblem('weight', '-3')).toBe('Enter a number above zero.');
  });
});
