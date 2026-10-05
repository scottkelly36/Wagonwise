import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { cardStyle } from '../../theme/tokens';
import { useThemeColors, type ThemeColors } from '../../theme/colors';
import { Icon, type IconName } from './icon';

interface Props {
  readonly icon: IconName;
  /** The icon's own colour: each quick action has its own, so they can be told apart at a glance. */
  readonly iconColor: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
}

/** A quick action on the map: a big coloured icon over a short label, on a lifted card. Sized to be
 *  hit with a glove or a thumb, not a fingertip. */
export function ActionCard({ icon, iconColor, label, onPress, testID }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Icon name={icon} size={32} color={iconColor} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      ...cardStyle(colors),
      flex: 1,
      minHeight: 72,
      paddingVertical: 10,
      paddingHorizontal: 6,
      gap: 4,
      justifyContent: 'center',
      alignItems: 'center',
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
  });
}
