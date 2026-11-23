import type { PortalForm, PortalPage, PortalProblem } from '@wagonwise/contracts/usage';

/** The portal's pages as the owner reads them. */
export const PAGE_LABELS: Readonly<Record<PortalPage, string>> = {
  fleet_overview: 'Overview',
  jobs: 'Jobs',
  live_trips: 'Live trips',
  fuel: 'Fuel',
  costs: 'Costs',
  job_costs: 'Job profit',
  outlook: 'Outlook',
  places: 'Places',
  checks: 'Walk-round check lists',
  maintenance: 'Maintenance',
  check_results: 'Check results',
  defects: 'Defects',
  audit_pack: 'Audit pack',
  reports: 'Reports',
  drivers: 'Drivers',
  vehicle_profiles: 'Vehicles',
  guide: 'Guide',
  users: 'Users',
  activity: 'Activity',
  settings: 'Settings',
  plan: 'Plan and invoices',
};

export const FORM_LABELS: Readonly<Record<PortalForm, string>> = {
  add_vehicle: 'Add a vehicle',
  create_job: 'Make a job',
  invite_person: 'Invite a colleague',
  invite_driver: 'Invite a driver',
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'Name',
  height: 'Height',
  width: 'Width',
  length: 'Length',
  weight: 'Weight',
  top_speed: 'Top speed',
  form: 'The whole form (refused)',
  reference: 'Reference',
  stops: 'Stops',
  price: 'Price',
  email: 'Email address',
  company: 'Company',
  identifier: 'Phone or email',
};

export const PROBLEM_LABELS: Readonly<Record<PortalProblem, string>> = {
  required: 'left empty',
  too_long: 'too long',
  not_a_number: 'not a number',
  invalid: 'not valid',
  capacity_reached: 'the plan is full',
  not_allowed: 'not allowed',
  other: 'other',
};

export const fieldLabel = (field: string): string => FIELD_LABELS[field] ?? field;

/** How far a company got: the first thing it has not done yet, in the order a firm sets up (a vehicle, a driver, a job). */
export function stoppedAt(firm: { vehicles: number; drivers: number; jobs: number }): string {
  if (firm.vehicles === 0 && firm.drivers === 0) return 'Nothing set up yet';
  if (firm.vehicles === 0) return 'No vehicle yet';
  if (firm.drivers === 0) return 'No driver yet';
  if (firm.jobs === 0) return 'Vehicle and driver set up, no job yet';
  return 'Has a job';
}

/** "3 of 4 sent (75%)", or a dash when it was never opened. */
export function sentText(opened: number, sent: number): string {
  if (opened === 0) return '–';
  return `${sent} of ${opened} (${Math.round((sent / opened) * 100)}%)`;
}

/** "1 min 30 s", "45 s", or a dash with no data. */
export function secondsText(s: number | null): string {
  if (s === null) return '–';
  const whole = Math.round(s);
  if (whole < 60) return `${whole} s`;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}
