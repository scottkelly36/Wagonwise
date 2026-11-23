import { describe, expect, it } from 'vitest';
import { researchAnswerText, showResearchNote } from './research-contact';

describe('showResearchNote', () => {
  it('shows only when the option is on, nothing has been answered, and the note has not been put away', () => {
    expect(showResearchNote({ available: true, agreed: null }, false)).toBe(true);
    expect(showResearchNote({ available: false, agreed: null }, false)).toBe(false);
    expect(showResearchNote({ available: true, agreed: true }, false)).toBe(false);
    expect(showResearchNote({ available: true, agreed: false }, false)).toBe(false);
    expect(showResearchNote({ available: true, agreed: null }, true)).toBe(false);
    expect(showResearchNote(undefined, false)).toBe(false);
  });
});

describe('researchAnswerText', () => {
  it('says what they answered and when, and nothing if they have not', () => {
    expect(researchAnswerText(true, '2026-11-23T10:00:00.000Z')).toBe(
      'You said yes on 23 November 2026.',
    );
    expect(researchAnswerText(false, '2026-11-23T10:00:00.000Z')).toBe(
      'You said no on 23 November 2026.',
    );
    expect(researchAnswerText(null, null)).toBeUndefined();
  });
});
