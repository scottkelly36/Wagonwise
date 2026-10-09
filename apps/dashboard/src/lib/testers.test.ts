import { describe, expect, it } from 'vitest';
import { roleLabel, testersCsv } from './testers';

describe('testersCsv', () => {
  it('writes a header and a row each, with blanks for what was not given', () => {
    const csv = testersCsv([
      { id: '1', email: 'sam@example.com', role: 'driver', createdAt: '2026-10-09T09:00:00.000Z' },
      {
        id: '2',
        email: 'kim@acme.co.uk',
        name: 'Kim, M',
        role: 'company',
        company: 'Acme',
        fleetSize: '6-15',
        createdAt: '2026-10-09T10:00:00.000Z',
      },
    ]);
    expect(csv.split('\r\n')).toEqual([
      '﻿Email,Name,Role,Company,Fleet size,Signed up',
      'sam@example.com,,Driver,,,2026-10-09T09:00:00.000Z',
      'kim@acme.co.uk,"Kim, M",Company,Acme,6-15,2026-10-09T10:00:00.000Z',
      '',
    ]);
  });

  it('names the roles', () => {
    expect(roleLabel('both')).toBe('Driver and company');
  });
});
