import { useEffect } from 'react';
import { Alert } from 'react-native';

import { decideAutoStart } from '../lib/auto-start-hours';
import { currentActivity } from '../lib/shift-log';
import { useHoursStartStore } from '../state/hours-start-store';
import { useShiftStore } from '../state/shift-store';

/** The trip we last dealt with, so going back to the map and returning to the trip screen does not ask again. */
let handledTrip: string | undefined;

/**
 * Starts the driving-hours clock when a route starts, so a driver who forgets to press it still has their hours counted. What it
 * does is the driver's choice: start the clock every time, ask (the first time a route starts with no shift on), or leave it to
 * the buttons. They can stop the clock with the buttons on the map at any time, and change the choice on the Driving hours screen.
 * It is advice only: the tachograph is the legal record.
 */
export function useAutoStartHours(tripId: string | undefined): void {
  const restored = useHoursStartStore((s) => s.restored);

  useEffect(() => {
    if (tripId === undefined || !restored || handledTrip === tripId) return;
    handledTrip = tripId;
    const { preference, setPreference } = useHoursStartStore.getState();
    const { log, record } = useShiftStore.getState();
    const decision = decideAutoStart(preference, currentActivity(log)?.kind);
    if (decision === 'start') {
      void record('driving');
    } else if (decision === 'ask') {
      Alert.alert(
        'Count your driving hours?',
        'WagonWise can keep a driving-hours clock and plan your breaks into the route. Start it whenever you set off on a route? ' +
          'You can stop it with the clock buttons on the map, and change this on the Driving hours screen (More tab). ' +
          'It is a guide: your tachograph is the legal record.',
        [
          {
            text: 'Yes, every time',
            onPress: () => {
              void setPreference('always');
              void record('driving');
            },
          },
          { text: 'Just this trip', onPress: () => void record('driving') },
          { text: 'Not now', style: 'cancel' },
        ],
      );
    }
  }, [tripId, restored]);
}
