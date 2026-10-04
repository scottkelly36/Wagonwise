import { useMemo } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

import { cardStyle } from '../../theme/tokens';
import { useThemeColors, type ThemeColors } from '../../theme/colors';
import { Icon, type IconName } from './icon';

interface Props {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
  /** Drawn in the brand blue, e.g. while a layers panel is open. */
  readonly active?: boolean;
  readonly testID?: string;
}

/** A round, lifted icon button for the map's edge (recentre, layers). 48 dp, so easy to hit. */
export function RoundButton({ icon, label, onPress, active = false, testID }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Icon name={icon} size={26} color={active ? colors.accent : colors.text} />
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    button: {
      ...cardStyle(colors),
      width: 52,
      height: 52,
      borderRadius: 26,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
}
