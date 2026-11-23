import type { ActivityDto } from '@wagonwise/contracts/usage';

export const activityRows = (a: ActivityDto) =>
  [
    { label: 'Accounts (not deleted)', value: String(a.total), tone: 'quiet' as const },
    { label: 'Used in the last day', value: String(a.active24h), tone: 'quiet' as const },
    { label: 'Used in the last week', value: String(a.active7d), tone: 'quiet' as const },
    { label: 'Used in the last month', value: String(a.active30d), tone: 'quiet' as const },
    {
      label: 'Never signed in',
      value: String(a.neverSignedIn),
      tone: a.neverSignedIn === 0 ? ('quiet' as const) : ('warn' as const),
    },
  ] as const;
