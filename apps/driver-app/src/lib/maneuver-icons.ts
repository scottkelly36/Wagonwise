import type { ManeuverDto } from '@wagonwise/contracts/routing';

import type { IconName } from '../components/ui/icon';

/** The arrow drawn on the turn card for each kind of step. */
export const MANEUVER_ICONS: Readonly<Record<ManeuverDto['kind'], IconName>> = {
  depart: 'navigation-variant',
  arrive: 'flag-checkered',
  straight: 'arrow-up',
  slight_left: 'arrow-top-left',
  left: 'arrow-left-top',
  sharp_left: 'arrow-bottom-left',
  slight_right: 'arrow-top-right',
  right: 'arrow-right-top',
  sharp_right: 'arrow-bottom-right',
  u_turn: 'arrow-u-left-top',
  keep_left: 'arrow-top-left',
  keep_right: 'arrow-top-right',
  exit_left: 'exit-run',
  exit_right: 'exit-run',
  merge: 'call-merge',
  roundabout: 'rotate-right',
  roundabout_exit: 'rotate-right',
  ferry: 'ferry',
};
