import { PORTAL_FORM_FIELDS } from '@wagonwise/contracts/usage';
import { describe, expect, it } from 'vitest';
import {
  inviteDriverProblems,
  invitePersonProblems,
  jobProblems,
  vehicleProblems,
} from './portal-forms';

describe('vehicleProblems', () => {
  it('says empty or not a number for a size, and never carries what was typed', () => {
    const problems = vehicleProblems(['name', 'heightM', 'widthM', 'topSpeedMph'], {
      heightM: '',
      widthM: 'abc',
      topSpeedMph: '999',
    });
    expect(problems).toEqual([
      { field: 'name', problem: 'required' },
      { field: 'height', problem: 'required' },
      { field: 'width', problem: 'not_a_number' },
      { field: 'top_speed', problem: 'invalid' },
    ]);
    expect(JSON.stringify(problems)).not.toContain('abc');
  });

  it('only uses fields the server accepts for that form', () => {
    const fields = vehicleProblems(
      ['name', 'heightM', 'widthM', 'lengthM', 'grossWeightT', 'topSpeedMph'],
      {},
    ).map((p) => p.field);
    for (const field of fields) {
      expect((PORTAL_FORM_FIELDS.add_vehicle as readonly string[]).includes(field)).toBe(true);
    }
  });
});

describe('jobProblems, invitePersonProblems and inviteDriverProblems', () => {
  it("classifies each form's fields with names the server accepts", () => {
    const job = jobProblems(['reference', 'stops', 'price'], { price: '4x' });
    expect(job).toEqual([
      { field: 'reference', problem: 'required' },
      { field: 'stops', problem: 'invalid' },
      { field: 'price', problem: 'not_a_number' },
    ]);
    const person = invitePersonProblems(['name', 'email', 'companyId'], { email: 'nope' });
    expect(person).toEqual([
      { field: 'name', problem: 'required' },
      { field: 'email', problem: 'invalid' },
      { field: 'company', problem: 'required' },
    ]);
    for (const p of job)
      expect((PORTAL_FORM_FIELDS.create_job as readonly string[]).includes(p.field)).toBe(true);
    for (const p of person)
      expect((PORTAL_FORM_FIELDS.invite_person as readonly string[]).includes(p.field)).toBe(true);
  });

  it("says whether a driver's phone or email was missing or wrong", () => {
    expect(inviteDriverProblems('', true)).toEqual([{ field: 'identifier', problem: 'required' }]);
    expect(inviteDriverProblems('07', true)).toEqual([{ field: 'identifier', problem: 'invalid' }]);
    expect(inviteDriverProblems('07700900123', false)).toEqual([]);
  });
});
