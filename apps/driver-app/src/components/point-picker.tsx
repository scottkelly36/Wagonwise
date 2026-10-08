import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useThemeColors, type ThemeColors } from '../theme/colors';
import { SegmentedControl } from './ui/segmented-control';

interface Props<T extends string> {
  readonly label: string;
  readonly options: readonly { readonly key: T; readonly label: string }[];
  readonly mode: T;
  readonly onModeChange: (mode: T) => void;
  readonly testID: string;
  /** The point has a sensible default (From is the driver's position): show it as one line with an action
   *  to change it, instead of the switch. Everything else is hidden until the action is taken. */
  readonly collapsed?:
    | { readonly text: string; readonly actionLabel: string; readonly onAction: () => void }
    | undefined;
  /** What to show for the chosen way of setting the point: the search box, a line of help. */
  readonly children: ReactNode;
}

/**
 * One end of a route (From or To): a label, a split button to choose how it is set, and below it only
 * what that way needs. A driver sees one input at a time instead of every way at once.
 */
export function PointPicker<T extends string>({
  label,
  options,
  mode,
  onModeChange,
  testID,
  collapsed,
  children,
}: Props<T>) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {collapsed !== undefined ? (
          <>
            <Text style={styles.collapsedText}>{collapsed.text}</Text>
            <TouchableOpacity
              onPress={collapsed.onAction}
              accessibilityRole="button"
              style={styles.action}
              testID={`${testID}-change-button`}
            >
              <Text style={styles.actionText}>{collapsed.actionLabel}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.control}>
            <SegmentedControl
              options={options}
              value={mode}
              onChange={onModeChange}
              testIDPrefix={`${testID}-mode`}
              compact
            />
          </View>
        )}
      </View>
      {collapsed === undefined && children}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { gap: 6 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    label: { width: 48, fontSize: 16, fontWeight: '700', color: colors.text },
    control: { flex: 1 },
    collapsedText: { flex: 1, fontSize: 16, color: colors.text },
    action: { minHeight: 44, minWidth: 64, justifyContent: 'center', alignItems: 'flex-end' },
    actionText: { fontSize: 16, fontWeight: '700', color: colors.accent },
  });
}
