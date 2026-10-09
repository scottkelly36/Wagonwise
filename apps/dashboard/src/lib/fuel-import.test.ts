import { describe, expect, it } from 'vitest';
import {
  guessMapping,
  readDateTime,
  readFuel,
  readLitres,
  readPence,
  type FuelMapping,
} from './fuel-import';

const local = (y: number, m: number, d: number, h: number, mi = 0) =>
  new Date(y, m - 1, d, h, mi).toISOString();

describe('readDateTime', () => {
  it('reads UK and ISO dates, with or without a time, and a separate time column', () => {
    expect(readDateTime('31/10/2026 14:05')).toBe(local(2026, 10, 31, 14, 5));
    expect(readDateTime('2026-10-31 14:05')).toBe(local(2026, 10, 31, 14, 5));
    expect(readDateTime('5.1.27')).toBe(local(2027, 1, 5, 12));
    expect(readDateTime('31/10/2026')).toBe(local(2026, 10, 31, 12));
    expect(readDateTime('31/10/2026', '07:45:10')).toBe(local(2026, 10, 31, 7, 45));
  });

  it('refuses what is not a date, including one that does not exist', () => {
    expect(readDateTime('')).toBeUndefined();
    expect(readDateTime('yesterday')).toBeUndefined();
    expect(readDateTime('31/02/2026')).toBeUndefined();
    expect(readDateTime('12/13/2026')).toBeUndefined();
    expect(readDateTime('1/1/2026 25:00')).toBeUndefined();
  });
});

describe('readPence and readLitres', () => {
  it('reads pounds with symbols, commas, credits and brackets', () => {
    expect(readPence('£1,234.56')).toBe(123_456);
    expect(readPence('300.75')).toBe(30_075);
    expect(readPence('12.5')).toBe(1_250);
    expect(readPence('-25.00')).toBe(-2_500);
    expect(readPence('(12.50)')).toBe(-1_250);
    expect(readPence('')).toBeUndefined();
    expect(readPence('12.345')).toBeUndefined();
    expect(readPence('abc')).toBeUndefined();
  });

  it('reads litres, and nothing for blank or text', () => {
    expect(readLitres('200.5')).toBe(200.5);
    expect(readLitres('1,200')).toBe(1200);
    expect(readLitres('')).toBeUndefined();
    expect(readLitres('n/a')).toBeUndefined();
  });
});

describe('guessMapping', () => {
  it('finds the columns from common headings, whatever their case', () => {
    const guess = guessMapping([
      'Transaction Date',
      'Time',
      'Vehicle Reg',
      'Product',
      'Litres',
      'Gross',
    ]);
    expect(guess).toEqual({
      date: 'Transaction Date',
      time: 'Time',
      registration: 'Vehicle Reg',
      amount: 'Gross',
      litres: 'Litres',
      description: 'Product',
    });
  });

  it('leaves out what it cannot find', () => {
    const guess = guessMapping(['Foo', 'Bar']);
    expect(guess.date).toBeUndefined();
    expect(guess.registration).toBeUndefined();
  });
});

describe('readFuel', () => {
  const mapping: FuelMapping = {
    date: 'Date',
    time: undefined,
    registration: 'Reg',
    amount: 'Gross',
    litres: 'Litres',
    description: 'Product',
  };
  const file = [
    'Date,Reg,Product,Litres,Gross',
    '05/10/2026,AB12 CDE,Diesel,200.5,"£300.75"',
    '06/10/2026,AB12 CDE,Diesel,,150.00',
    '07/10/2026,,Diesel,50,75.00',
    'nope,AB12 CDE,Diesel,50,75.00',
    '08/10/2026,AB12 CDE,Diesel,50,abc',
    '09/10/2026,AB12 CDE,AdBlue,10,-12.50',
    '',
  ].join('\r\n');

  it('reads the rows it can and says why it skipped the others, by line', () => {
    const read = readFuel(file, mapping);
    expect(read.problem).toBeUndefined();
    expect(read.rows).toEqual([
      {
        occurredAt: local(2026, 10, 5, 12),
        registration: 'AB12 CDE',
        amountPence: 30_075,
        litres: 200.5,
        description: 'Diesel',
      },
      {
        occurredAt: local(2026, 10, 6, 12),
        registration: 'AB12 CDE',
        amountPence: 15_000,
        description: 'Diesel',
      },
      {
        occurredAt: local(2026, 10, 9, 12),
        registration: 'AB12 CDE',
        amountPence: -1_250,
        litres: 10,
        description: 'AdBlue',
      },
    ]);
    expect(read.skipped).toEqual([
      { line: 4, why: 'no registration' },
      { line: 5, why: 'the date could not be read' },
      { line: 6, why: 'the amount could not be read' },
    ]);
  });

  it('says when the mapping or the file cannot be used', () => {
    expect(readFuel('', mapping).problem).toMatch(/empty/);
    expect(readFuel(file, { ...mapping, amount: 'Missing' }).problem).toMatch(/Choose the columns/);
    expect(
      readFuel('Date,Reg,Gross\nnope,AB12,1.00', {
        ...mapping,
        litres: undefined,
        description: undefined,
      }).problem,
    ).toMatch(/No purchases/);
  });
});
