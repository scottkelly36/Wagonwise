import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { SosSheet } from './sos-sheet';
import type { MapPoint } from './route-map';

interface Props {
  /** Where the driver is now. */
  readonly point: MapPoint | undefined;
  readonly testID?: string;
}

/**
 * The red SOS button for the map's edge. It only opens the SOS sheet: nothing is sent until the driver presses and holds the
 * button inside it, so a stray tap here is harmless.
 */
export function SosButton({ point, testID = 'sos-button' }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="SOS"
        testID={testID}
      >
        <Text style={styles.text}>SOS</Text>
      </TouchableOpacity>
      <SosSheet visible={open} onClose={() => setOpen(false)} point={point} />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  text: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
});
