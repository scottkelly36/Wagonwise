import type { CheckItem, DefectSeverity } from './check-template.js';

export const STARTER_NAME = 'Daily walk-round check';

/**
 * An example list to start from, not a standard and not complete: a firm edits it freely, and is
 * responsible for what its own checks cover. Brakes, steering, tyres and lights default to "do not drive"
 * because a defect there usually is; everything is changeable.
 */
export function starterItems(newId: () => string): CheckItem[] {
  const passFail = (
    label: string,
    help: string | undefined,
    severity: DefectSeverity,
  ): CheckItem => ({
    id: newId(),
    kind: 'pass_fail',
    label,
    help,
    required: true,
    severity,
    photoOnDefect: true,
  });
  return [
    passFail(
      'Tyres and wheel nuts',
      'Condition, tread, damage, pressure, nuts secure',
      'do_not_drive',
    ),
    passFail(
      'Brakes and air system',
      'Pressure builds, no audible air leaks, brakes hold',
      'do_not_drive',
    ),
    passFail('Steering', 'No excessive play, moves freely', 'do_not_drive'),
    passFail(
      'Lights and indicators',
      'Head, tail, brake, indicators, hazards, marker lights',
      'do_not_drive',
    ),
    passFail('Mirrors and glass', 'Present, clean, adjusted, no damage', 'do_not_drive'),
    passFail('Wipers, washers and horn', undefined, 'advisory'),
    passFail('Seat belt', undefined, 'do_not_drive'),
    passFail('Fluid levels', 'Oil, coolant, screen wash, AdBlue', 'advisory'),
    passFail('Leaks', 'Fuel, oil or coolant under the vehicle', 'advisory'),
    passFail('Number plates and markings', 'Clean, legible, correct', 'advisory'),
    passFail(
      'Coupling and air and electrical lines',
      'Trailer coupling secure, lines connected',
      'do_not_drive',
    ),
    passFail('Load security', 'Load, curtains, doors, straps and ropes', 'do_not_drive'),
    {
      id: newId(),
      kind: 'yes_no',
      label: 'Are your driver card and paperwork with you?',
      help: undefined,
      required: true,
      defectWhen: 'no',
      severity: 'advisory',
      photoOnDefect: false,
    },
    {
      id: newId(),
      kind: 'number',
      label: 'Odometer reading',
      help: undefined,
      required: true,
      unit: 'miles',
      min: undefined,
      max: undefined,
      severity: 'advisory',
    },
    {
      id: newId(),
      kind: 'note',
      label: 'Anything else to report?',
      help: undefined,
      required: false,
    },
  ];
}
