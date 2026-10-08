import { describe, expect, it } from 'vitest';
import type { CheckItem } from './check-template.js';
import { evaluateCheck, photoWanted, type Answer } from './check.js';

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
  label: 'Paperwork with you?',
  required: true,
  defectWhen: 'no',
  severity: 'advisory',
  photoOnDefect: false,
};
const psi: CheckItem = {
  id: 'psi',
  kind: 'number',
  label: 'Tyre pressure',
  required: true,
  unit: 'psi',
  min: 80,
  max: 120,
  severity: 'advisory',
};
const notes: CheckItem = { id: 'notes', kind: 'note', label: 'Anything else?', required: false };
const load: CheckItem = { id: 'load', kind: 'photo', label: 'Photo of the load', required: true };
const all = [tyres, wipers, papers, psi, notes, load];

const clean: Answer[] = [
  { itemId: 'tyres', value: 'ok' },
  { itemId: 'wipers', value: 'ok' },
  { itemId: 'papers', value: 'yes' },
  { itemId: 'psi', value: 100 },
  { itemId: 'load', value: 'photo' },
];

describe('evaluateCheck: what was found', () => {
  it('is clear when everything is fine, with no defects', () => {
    const result = evaluateCheck(all, clean);
    expect(result.ok && result.value.result).toBe('clear');
    expect(result.ok && result.value.defects).toEqual([]);
  });

  it('turns a flagged tick into a defect with its severity and the driver’s note', () => {
    const result = evaluateCheck(all, [
      { itemId: 'tyres', value: 'defect', note: '  Nearside front is bald  ' },
      ...clean.slice(1),
    ]);
    expect(result.ok && result.value.defects).toEqual([
      {
        itemId: 'tyres',
        label: 'Tyres',
        severity: 'do_not_drive',
        detail: 'Flagged as a defect',
        note: 'Nearside front is bald',
      },
    ]);
    expect(result.ok && result.value.result).toBe('do_not_drive');
  });

  it('treats the defect answer to a yes-or-no as a defect, and the other as fine', () => {
    const bad = evaluateCheck(all, [
      ...clean.filter((a) => a.itemId !== 'papers'),
      { itemId: 'papers', value: 'no' },
    ]);
    expect(bad.ok && bad.value.defects[0]).toMatchObject({
      itemId: 'papers',
      detail: 'Answered "no"',
    });
    expect(bad.ok && bad.value.result).toBe('advisory');
  });

  it('flags a number outside its range, and says what it should be', () => {
    const low = evaluateCheck(all, [
      ...clean.filter((a) => a.itemId !== 'psi'),
      { itemId: 'psi', value: 70 },
    ]);
    expect(low.ok && low.value.defects[0]?.detail).toBe('Reading 70 psi, should be 80 to 120 psi');
    const edge = evaluateCheck(all, [
      ...clean.filter((a) => a.itemId !== 'psi'),
      { itemId: 'psi', value: 120 },
    ]);
    expect(edge.ok && edge.value.defects).toEqual([]);
  });

  it('says "at least" or "at most" when only one limit is set', () => {
    const atLeast: CheckItem = { ...psi, max: undefined };
    const result = evaluateCheck([atLeast], [{ itemId: 'psi', value: 10 }]);
    expect(result.ok && result.value.defects[0]?.detail).toBe(
      'Reading 10 psi, should be at least 80 psi',
    );
  });

  it('takes the worst defect as the result: do not drive over fix soon over clear', () => {
    const both = evaluateCheck(all, [
      { itemId: 'tyres', value: 'defect' },
      { itemId: 'wipers', value: 'defect' },
      ...clean.slice(2),
    ]);
    expect(both.ok && both.value.defects).toHaveLength(2);
    expect(both.ok && both.value.result).toBe('do_not_drive');
    const soon = evaluateCheck(all, [
      clean[0]!,
      { itemId: 'wipers', value: 'defect' },
      ...clean.slice(2),
    ]);
    expect(soon.ok && soon.value.result).toBe('advisory');
  });
});

describe('evaluateCheck: refusing bad answers', () => {
  const reason = (answers: Answer[]) => {
    const r = evaluateCheck(all, answers);
    return r.ok ? 'ok' : `${r.error.reason}:${r.error.itemId}`;
  };

  it('refuses an answer to a question that is not in the list, or answered twice', () => {
    expect(reason([...clean, { itemId: 'ghost', value: 'ok' }])).toBe('unknown_question:ghost');
    expect(reason([...clean, { itemId: 'tyres', value: 'ok' }])).toBe('repeated_answer:tyres');
  });

  it('refuses a required question left unanswered, and a blank required text', () => {
    expect(reason(clean.filter((a) => a.itemId !== 'psi'))).toBe('missing_answer:psi');
    const blankRequired: CheckItem = { ...notes, required: true };
    const r = evaluateCheck([blankRequired], [{ itemId: 'notes', value: '   ' }]);
    expect(r.ok).toBe(false);
  });

  it('does not need an optional note, and drops a blank one', () => {
    const r = evaluateCheck(all, [...clean, { itemId: 'notes', value: '  ' }]);
    expect(r.ok && r.value.answers.some((a) => a.itemId === 'notes')).toBe(false);
  });

  it('refuses an answer of the wrong kind', () => {
    expect(reason(clean.map((a) => (a.itemId === 'tyres' ? { ...a, value: 'fine' } : a)))).toBe(
      'wrong_kind_of_answer:tyres',
    );
    expect(reason(clean.map((a) => (a.itemId === 'psi' ? { ...a, value: 'lots' } : a)))).toBe(
      'wrong_kind_of_answer:psi',
    );
    expect(reason(clean.map((a) => (a.itemId === 'papers' ? { ...a, value: 'maybe' } : a)))).toBe(
      'wrong_kind_of_answer:papers',
    );
    expect(reason(clean.map((a) => (a.itemId === 'load' ? { ...a, value: 'yes' } : a)))).toBe(
      'wrong_kind_of_answer:load',
    );
  });
});

describe('photoWanted', () => {
  it('always wants a photo question’s, and a flagged defect’s when the question asks for one', () => {
    expect(photoWanted(load, undefined)).toBe(true);
    expect(photoWanted(tyres, { itemId: 'tyres', value: 'defect' })).toBe(true);
    expect(photoWanted(tyres, { itemId: 'tyres', value: 'ok' })).toBe(false);
    expect(photoWanted(wipers, { itemId: 'wipers', value: 'defect' })).toBe(false);
    expect(photoWanted(papers, { itemId: 'papers', value: 'no' })).toBe(false);
    expect(photoWanted(psi, { itemId: 'psi', value: 1 })).toBe(false);
  });
});
