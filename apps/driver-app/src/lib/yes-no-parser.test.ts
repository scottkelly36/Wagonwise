import { parseYesNo } from './yes-no-parser';

describe('parseYesNo', () => {
  it.each(['yes', 'Yes', 'yeah', 'yep', "yeah that's right", 'save it', 'confirm'])(
    'reads "%s" as yes',
    (transcript) => {
      expect(parseYesNo(transcript)).toBe('yes');
    },
  );

  it.each(['no', 'No', 'nope', 'nah', 'cancel that', "don't save", 'that was wrong'])(
    'reads "%s" as no',
    (transcript) => {
      expect(parseYesNo(transcript)).toBe('no');
    },
  );

  it.each(['I know where that is', 'notice the sign', 'unrelated mumbling', ''])(
    'reads "%s" as unclear rather than matching "no" as a substring',
    (transcript) => {
      expect(parseYesNo(transcript)).toBe('unclear');
    },
  );
});
