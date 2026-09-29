import { PRIVILEGE_PRESETS, PRIVILEGES, type Privilege } from '@wagonwise/contracts/staff';

/** What each privilege lets someone do, in the words the Users screen shows. */
export const PRIVILEGE_LABELS: Record<Privilege, string> = {
  manage_users: 'Manage users',
  manage_fleet: 'Manage vehicles',
  dispatch: 'Dispatch jobs',
  view_live_map: 'See the live map',
  view_reports: 'See reports',
  manage_billing: 'Manage billing',
};

export const PRESET_LABELS: Record<keyof typeof PRIVILEGE_PRESETS, string> = {
  owner: 'Manager (everything)',
  dispatcher: 'Dispatcher',
  viewer: 'Viewer',
};

export { PRIVILEGE_PRESETS, PRIVILEGES };
