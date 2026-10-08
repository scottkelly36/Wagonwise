import type { CheckItem } from '@wagonwise/contracts/checks';
import { describe, expect, it } from 'vitest';
import { changeKind, describeList, moveItem, newItem, problemsWith } from './check-builder';

const a = newItem('pass_fail', 'a', 'Tyres');
const b = newItem('note', 'b', 'Notes');
const c = newItem('photo', 'c', 'Load');

describe('newItem', () => {
  it('starts each kind with settings that make sense', () => {
    expect(newItem('pass_fail', 'x')).toMatchObject({ severity: 'advisory', photoOnDefect: true });
    expect(newItem('yes_no', 'x')).toMatchObject({ defectWhen: 'no' });
    expect(newItem('note', 'x')).toMatchObject({ required: false });
    expect(newItem('number', 'x')).toMatchObject({ kind: 'number' });
  });
});

describe('changeKind', () => {
  it('keeps the id, the text and the help when the kind changes', () => {
    const item: CheckItem = { ...a, help: 'Look at the tread', required: false };
    const changed = changeKind(item, 'yes_no');
    expect(changed).toMatchObject({
      kind: 'yes_no',
      id: 'a',
      label: 'Tyres',
      help: 'Look at the tread',
      required: false,
    });
  });

  it('leaves a question alone when the kind is the same', () => {
    expect(changeKind(a, 'pass_fail')).toBe(a);
  });
});

describe('moveItem', () => {
  it('moves a question up or down, and does nothing past either end', () => {
    expect(moveItem([a, b, c], 1, -1).map((i) => i.id)).toEqual(['b', 'a', 'c']);
    expect(moveItem([a, b, c], 1, 1).map((i) => i.id)).toEqual(['a', 'c', 'b']);
    expect(moveItem([a, b, c], 0, -1).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(moveItem([a, b, c], 2, 1).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('problemsWith', () => {
  const ok = { name: 'Tractor', appliesTo: 'all' as const, vehicleIds: [], items: [a] };

  it('is empty for a list that is ready', () => {
    expect(problemsWith(ok)).toEqual([]);
  });

  it('says what is missing, in plain words', () => {
    expect(problemsWith({ ...ok, name: ' ', items: [] })).toEqual([
      'Give the list a name.',
      'Add at least one question.',
    ]);
    expect(problemsWith({ ...ok, items: [newItem('note', 'z', ' ')] })).toEqual([
      'Every question needs some text.',
    ]);
    expect(problemsWith({ ...ok, appliesTo: 'selected' })).toEqual([
      'Choose which vehicles it is for, or make it for all.',
    ]);
  });

  it('flags a number whose lowest is above its highest', () => {
    const number: CheckItem = {
      id: 'n',
      kind: 'number',
      label: 'Pressure',
      required: true,
      min: 120,
      max: 80,
      severity: 'advisory',
    };
    expect(problemsWith({ ...ok, items: [number] })).toEqual([
      '"Pressure": the lowest is above the highest.',
    ]);
  });
});

describe('describeList', () => {
  it('summarises questions and vehicles', () => {
    expect(describeList({ items: [a], appliesTo: 'all', vehicleIds: [] })).toBe(
      '1 question, for all vehicles',
    );
    expect(describeList({ items: [a, b], appliesTo: 'selected', vehicleIds: ['v1', 'v2'] })).toBe(
      '2 questions, for 2 vehicles',
    );
  });
});
