import { describe, expect, it } from 'vitest';
import { parseCsv, readDate, readImport } from './maintenance-import';

describe('parseCsv', () => {
  it('reads quotes, commas in quotes, CRLF, a byte-order mark and blank lines', () => {
    expect(parseCsv('﻿a,"b,c","d ""q"""\r\n\r\n1,2,3\n')).toEqual([
      ['a', 'b,c', 'd "q"'],
      ['1', '2', '3'],
    ]);
  });
});

describe('readDate', () => {
  it('turns UK dates into ISO days and leaves the rest as typed', () => {
    expect(readDate('31/01/2027')).toBe('2027-01-31');
    expect(readDate('3.4.27')).toBe('2027-04-03');
    expect(readDate('2027-01-31')).toBe('2027-01-31');
    expect(readDate(' next spring ')).toBe('next spring');
  });
});

describe('readImport', () => {
  it('reads a column per thing, skipping empty cells', () => {
    const r = readImport(
      'Registration,MOT,Tail lift\nAB12 CDE,31/01/2027,\nXY99ZZZ,2027-02-01,03/03/2027\n',
    );
    expect(r.problem).toBeUndefined();
    expect(r.rows).toEqual([
      { registration: 'AB12 CDE', itemName: 'MOT', dueDate: '2027-01-31' },
      { registration: 'XY99ZZZ', itemName: 'MOT', dueDate: '2027-02-01' },
      { registration: 'XY99ZZZ', itemName: 'Tail lift', dueDate: '2027-03-03' },
    ]);
  });

  it('reads a row per date', () => {
    const r = readImport('Reg,Item,Due date\nAB12CDE,MOT,01/02/2027\nAB12CDE,Service,\n');
    expect(r.rows).toEqual([{ registration: 'AB12CDE', itemName: 'MOT', dueDate: '2027-02-01' }]);
  });

  it('says what is wrong with a file it cannot use', () => {
    expect(readImport('').problem).toMatch(/empty/);
    expect(readImport('Name,MOT\nx,1/1/2027').problem).toMatch(/Registration/);
    expect(readImport('Registration,MOT\nAB12CDE,').problem).toMatch(/no dates/);
    expect(readImport('Registration\nAB12CDE').problem).toMatch(/column/);
  });
});
