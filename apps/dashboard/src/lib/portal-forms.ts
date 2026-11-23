import type { PortalProblem } from '@wagonwise/contracts/usage';

/** One problem a form showed: which field, and what kind. Never the text of the message and never what was typed. */
export interface FormProblem {
  readonly field: string;
  readonly problem: PortalProblem;
}

const empty = (value: string | undefined): boolean => (value ?? '').trim() === '';

const VEHICLE_FIELDS: Readonly<Record<string, string>> = {
  name: 'name',
  heightM: 'height',
  widthM: 'width',
  lengthM: 'length',
  grossWeightT: 'weight',
  topSpeedMph: 'top_speed',
};

/** The add-a-vehicle form's problems: `errorKeys` are the fields with an error, `values` what is in them (looked at only to tell empty from wrong). */
export function vehicleProblems(
  errorKeys: readonly string[],
  values: Readonly<Record<string, string>>,
): FormProblem[] {
  return errorKeys.flatMap((key): FormProblem[] => {
    const field = VEHICLE_FIELDS[key];
    if (field === undefined) return [];
    if (key === 'name') return [{ field, problem: 'required' }];
    if (key === 'topSpeedMph') return [{ field, problem: 'invalid' as const }];
    return [
      { field, problem: empty(values[key]) ? ('required' as const) : ('not_a_number' as const) },
    ];
  });
}

/** The make-a-job form's problems. */
export function jobProblems(
  errorKeys: readonly string[],
  values: Readonly<Record<string, string>>,
): FormProblem[] {
  return errorKeys.flatMap((key): FormProblem[] => {
    if (key === 'reference') return [{ field: 'reference', problem: 'required' }];
    if (key === 'stops') return [{ field: 'stops', problem: 'invalid' }];
    if (key === 'price') {
      return [{ field: 'price', problem: empty(values.price) ? 'required' : 'not_a_number' }];
    }
    return [];
  });
}

/** The invite-a-colleague form's problems. */
export function invitePersonProblems(
  errorKeys: readonly string[],
  values: Readonly<Record<string, string>>,
): FormProblem[] {
  return errorKeys.flatMap((key): FormProblem[] => {
    if (key === 'name') return [{ field: 'name', problem: 'required' }];
    if (key === 'email') {
      return [{ field: 'email', problem: empty(values.email) ? 'required' : 'invalid' }];
    }
    if (key === 'companyId') return [{ field: 'company', problem: 'required' }];
    return [];
  });
}

/** The invite-a-driver form's one problem, if it has one: nothing typed, or something that is not a phone number or an email address. */
export function inviteDriverProblems(identifier: string, hasError: boolean): FormProblem[] {
  if (!hasError) return [];
  return [{ field: 'identifier', problem: empty(identifier) ? 'required' : 'invalid' }];
}
