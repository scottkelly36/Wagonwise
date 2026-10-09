import type { TesterDto } from '@wagonwise/contracts/signups';

import { csvCell } from './job-report';

const ROLE_LABELS: Record<string, string> = {
  driver: 'Driver',
  company: 'Company',
  both: 'Driver and company',
  other: 'Other',
};

export const roleLabel = (role: string): string => ROLE_LABELS[role] ?? role;

/** The list as a spreadsheet file, for mailing the testers from your own mail tool. */
export function testersCsv(testers: readonly TesterDto[]): string {
  const lines = [
    ['Email', 'Name', 'Role', 'Company', 'Fleet size', 'Signed up'].map(csvCell).join(','),
    ...testers.map((t) =>
      [t.email, t.name ?? '', roleLabel(t.role), t.company ?? '', t.fleetSize ?? '', t.createdAt]
        .map(csvCell)
        .join(','),
    ),
  ];
  return '﻿' + lines.join('\r\n') + '\r\n';
}
