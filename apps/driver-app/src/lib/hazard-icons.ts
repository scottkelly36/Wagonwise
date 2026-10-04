import type { HazardTypeDto } from '@wagonwise/contracts/hazards';

import type { IconName } from '../components/ui/icon';

/** One icon per hazard type, so a driver can tell a low bridge from roadworks at a glance. Every type
 *  must have one (a `Record`), so a new type fails to compile here until it is given an icon. */
export const HAZARD_TYPE_ICONS: Record<HazardTypeDto, IconName> = {
  low_bridge: 'bridge',
  weight_limit: 'weight',
  width_restriction: 'arrow-expand-horizontal',
  tight_bend: 'sign-direction',
  roadworks: 'traffic-cone',
  flooding: 'waves',
  no_hgv: 'truck-remove-outline',
  other: 'alert-circle-outline',
};
