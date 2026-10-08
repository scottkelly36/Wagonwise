import type { CheckItem } from '@wagonwise/contracts/checks';

import {
  buildAnswers,
  canFinish,
  isDefect,
  localResult,
  missingRequired,
  numberFromText,
  photosToSend,
  prepareCheckPhoto,
  wantsPhoto,
  type Answers,
} from './check-flow';

const tyres: CheckItem = {
  id: 'tyres',
  kind: 'pass_fail',
  label: 'Tyres',
  required: true,
  severity: 'do_not_drive',
  photoOnDefect: true,
};
const wipers: CheckItem = {
  id: 'wipers',
  kind: 'pass_fail',
  label: 'Wipers',
  required: true,
  severity: 'advisory',
  photoOnDefect: false,
};
const papers: CheckItem = {
  id: 'papers',
  kind: 'yes_no',
  label: 'Paperwork?',
  required: true,
  defectWhen: 'no',
  severity: 'advisory',
  photoOnDefect: false,
};
const psi: CheckItem = {
  id: 'psi',
  kind: 'number',
  label: 'Pressure',
  required: true,
  unit: 'psi',
  min: 80,
  max: 120,
  severity: 'advisory',
};
const notes: CheckItem = { id: 'notes', kind: 'note', label: 'Anything else?', required: false };
const load: CheckItem = { id: 'load', kind: 'photo', label: 'Photo of the load', required: true };
const items = [tyres, wipers, papers, psi, notes, load];
const photo = { contentType: 'image/jpeg', dataBase64: 'AAAA' } as const;

const good: Answers = {
  tyres: { value: 'ok' },
  wipers: { value: 'ok' },
  papers: { value: 'yes' },
  psi: { value: 100 },
  load: { photo },
};

describe('numberFromText', () => {
  it('reads whole numbers, decimals and a comma decimal', () => {
    expect(numberFromText('12')).toBe(12);
    expect(numberFromText(' 12.5 ')).toBe(12.5);
    expect(numberFromText('12,5')).toBe(12.5);
    expect(numberFromText('-3')).toBe(-3);
  });

  it('refuses anything else', () => {
    for (const bad of ['', 'abc', '1.2.3', '12 psi', '.5']) {
      expect(numberFromText(bad)).toBeUndefined();
    }
  });
});

describe('isDefect and wantsPhoto', () => {
  it('knows a flagged tick, the defect answer to a yes-or-no, and a number outside its range', () => {
    expect(isDefect(tyres, { value: 'defect' })).toBe(true);
    expect(isDefect(tyres, { value: 'ok' })).toBe(false);
    expect(isDefect(papers, { value: 'no' })).toBe(true);
    expect(isDefect(papers, { value: 'yes' })).toBe(false);
    expect(isDefect(psi, { value: 70 })).toBe(true);
    expect(isDefect(psi, { value: 125 })).toBe(true);
    expect(isDefect(psi, { value: 80 })).toBe(false);
    expect(isDefect(notes, { value: 'x' })).toBe(false);
    expect(isDefect(tyres, undefined)).toBe(false);
  });

  it('asks for a photo on a photo question, and on a defect that asks for one', () => {
    expect(wantsPhoto(load, undefined)).toBe(true);
    expect(wantsPhoto(tyres, { value: 'defect' })).toBe(true);
    expect(wantsPhoto(tyres, { value: 'ok' })).toBe(false);
    expect(wantsPhoto(wipers, { value: 'defect' })).toBe(false);
  });
});

describe('missingRequired and canFinish', () => {
  it('lists the required questions not yet answered, in order', () => {
    expect(missingRequired(items, {}).map((i) => i.id)).toEqual([
      'tyres',
      'wipers',
      'papers',
      'psi',
      'load',
    ]);
    expect(missingRequired(items, good)).toEqual([]);
  });

  it('does not need the optional note, and needs the photo for a required photo question', () => {
    expect(canFinish(items, good)).toBe(true);
    const { load: _photo, ...withoutPhoto } = good;
    expect(canFinish(items, withoutPhoto)).toBe(false);
  });

  it('does not count a blank note as an answer, or a number that was never typed', () => {
    const required: CheckItem = { ...notes, required: true };
    expect(canFinish([required], { notes: { value: '   ' } })).toBe(false);
    expect(canFinish([psi], { psi: { value: undefined } })).toBe(false);
  });

  it('cannot finish an empty list', () => {
    expect(canFinish([], {})).toBe(false);
  });
});

describe('buildAnswers', () => {
  it('sends each answered question in the form core takes, the note only for a defect', () => {
    const answers: Answers = {
      ...good,
      tyres: { value: 'defect', note: '  Nearside front bald ' },
      wipers: { value: 'ok', note: 'ignored: not a defect' },
    };
    expect(buildAnswers(items, answers)).toEqual([
      { itemId: 'tyres', value: 'defect', note: 'Nearside front bald' },
      { itemId: 'wipers', value: 'ok' },
      { itemId: 'papers', value: 'yes' },
      { itemId: 'psi', value: 100 },
      { itemId: 'load', value: 'photo' },
    ]);
  });

  it('leaves out an optional question the driver did not touch', () => {
    expect(buildAnswers(items, good).some((a) => a.itemId === 'notes')).toBe(false);
    const withNote = buildAnswers(items, { ...good, notes: { value: 'Mind the gate' } });
    expect(withNote.find((a) => a.itemId === 'notes')?.value).toBe('Mind the gate');
  });
});

describe('photosToSend', () => {
  it('sends the photo question’s photo and a defect’s photo, and not a photo taken for a fine answer', () => {
    const answers: Answers = {
      ...good,
      tyres: { value: 'defect', photo },
      wipers: { value: 'ok', photo },
    };
    expect(photosToSend(items, answers).map((p) => p.itemId)).toEqual(['tyres', 'load']);
  });

  it('drops a defect’s photo if the driver then says it is fine', () => {
    const answers: Answers = { ...good, tyres: { value: 'ok', photo } };
    expect(photosToSend(items, answers).map((p) => p.itemId)).toEqual(['load']);
  });
});

describe('localResult', () => {
  it('is clear when nothing is wrong', () => {
    expect(localResult(items, good)).toEqual({ result: 'clear', defects: [] });
  });

  it('takes the worst defect as the result', () => {
    const soon = localResult(items, { ...good, wipers: { value: 'defect' } });
    expect(soon).toEqual({
      result: 'advisory',
      defects: [{ label: 'Wipers', severity: 'advisory' }],
    });
    const stop = localResult(items, {
      ...good,
      wipers: { value: 'defect' },
      tyres: { value: 'defect' },
    });
    expect(stop.result).toBe('do_not_drive');
    expect(stop.defects).toHaveLength(2);
  });
});

describe('prepareCheckPhoto', () => {
  it('accepts a camera photo, defaulting to a JPEG', () => {
    expect(prepareCheckPhoto({ base64: 'aGVsbG8=' })).toEqual({
      contentType: 'image/jpeg',
      dataBase64: 'aGVsbG8=',
    });
    expect(prepareCheckPhoto({ base64: 'aGVsbG8=', mimeType: 'image/png' })?.contentType).toBe(
      'image/png',
    );
  });

  it('refuses a missing, empty or non-image photo', () => {
    expect(prepareCheckPhoto({})).toBeUndefined();
    expect(prepareCheckPhoto({ base64: null })).toBeUndefined();
    expect(prepareCheckPhoto({ base64: '' })).toBeUndefined();
    expect(prepareCheckPhoto({ base64: 'aGVsbG8=', mimeType: 'application/pdf' })).toBeUndefined();
  });
});
