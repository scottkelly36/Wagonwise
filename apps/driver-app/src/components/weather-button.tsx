import { WEATHER_ATTRIBUTION, type WeatherWarningDto } from '@wagonwise/contracts/weather';
import { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useWeatherWarnings } from '../api/use-weather-warnings';
import {
  headlineWarning,
  KIND_ICONS,
  LEVEL_COLOURS,
  warningTitle,
  warningWhen,
} from '../lib/weather';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle, radius } from '../theme/tokens';
import { Icon } from './ui/icon';

interface Props {
  /** Where the driver is; the warnings are the ones over this point. */
  readonly point: { readonly lat: number; readonly lon: number } | undefined;
}

/**
 * A round badge on the map when a Met Office weather warning covers where the driver is (in force, or
 * starting within a day): the weather's icon on the warning's colour, so an amber wind warning is an
 * amber wind symbol. Tap it for the details. Nothing shows when there is no warning. Advice only: it
 * never changes a route or blocks anything.
 */
export function WeatherButton({ point }: Props) {
  const warnings = useWeatherWarnings(point);
  const [open, setOpen] = useState(false);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const top = headlineWarning(warnings, new Date());
  if (top === undefined) return null;
  const level = top.level;

  return (
    <>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: LEVEL_COLOURS[level] }]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${warningTitle(top)} weather warning`}
        testID="weather-button"
      >
        <Icon
          name={KIND_ICONS[top.kinds[0] ?? 'other']}
          size={28}
          color={level === 'yellow' ? '#1A1A1A' : '#FFFFFF'}
        />
        {warnings.length > 1 && <Text style={styles.count}>{warnings.length}</Text>}
      </TouchableOpacity>
      <WeatherSheet visible={open} warnings={warnings} onClose={() => setOpen(false)} />
    </>
  );
}

function WeatherSheet({
  visible,
  warnings,
  onClose,
}: {
  readonly visible: boolean;
  readonly warnings: readonly WeatherWarningDto[];
  readonly onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.heading}>Weather warnings</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {warnings.map((w) => (
              <View key={w.id} style={styles.row} testID={`weather-warning-${w.id}`}>
                <View style={[styles.rowIcon, { backgroundColor: LEVEL_COLOURS[w.level] }]}>
                  <Icon
                    name={KIND_ICONS[w.kinds[0] ?? 'other']}
                    size={26}
                    color={w.level === 'yellow' ? '#1A1A1A' : '#FFFFFF'}
                  />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.title}>{warningTitle(w)}</Text>
                  <Text style={styles.when}>{warningWhen(w)}</Text>
                  <Text style={styles.body}>{w.headline}</Text>
                  {w.details !== undefined && <Text style={styles.body}>{w.details}</Text>}
                </View>
              </View>
            ))}
            <Text style={styles.advice}>
              A warning is advice from the Met Office. Check it before you set off, and use your own
              judgement on the road.
            </Text>
            <Text style={styles.attribution}>{WEATHER_ATTRIBUTION}</Text>
          </ScrollView>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button">
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
    count: {
      position: 'absolute',
      right: -2,
      top: -2,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      overflow: 'hidden',
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '800',
      lineHeight: 20,
      color: colors.textOnAccent,
      backgroundColor: colors.text,
    },
    container: { flex: 1, justifyContent: 'flex-end' },
    backdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      paddingHorizontal: 20,
      paddingTop: 12,
      maxHeight: '85%',
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.surfaceStrong,
      marginBottom: 14,
    },
    heading: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 12 },
    row: { flexDirection: 'row', gap: 14, marginBottom: 18 },
    rowIcon: {
      width: 52,
      height: 52,
      borderRadius: radius.badge,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rowText: { flex: 1, gap: 2 },
    title: { fontSize: 18, fontWeight: '700', color: colors.text },
    when: { fontSize: 14, color: colors.textMuted },
    body: { fontSize: 16, color: colors.textSecondary, marginTop: 4 },
    advice: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
    attribution: { fontSize: 12, color: colors.textDim, marginTop: 8 },
    close: {
      marginTop: 14,
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    closeText: { fontSize: 17, fontWeight: '700', color: colors.textOnAccent },
  });
}
