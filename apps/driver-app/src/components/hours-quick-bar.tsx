import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { hoursStatus, type ActivityKind } from '../lib/driver-hours';
import { quickSummary } from '../lib/hours-quick';
import { currentActivity } from '../lib/shift-log';
import { useShiftStore } from '../state/shift-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle } from '../theme/tokens';
import { Icon, type IconName } from './ui/icon';

const clockNow = (): number => Date.now();

const CHOICES: { kind: ActivityKind; label: string; icon: IconName }[] = [
  { kind: 'driving', label: 'Driving', icon: 'steering' },
  { kind: 'other_work', label: 'Other work', icon: 'package-variant-closed' },
  { kind: 'break', label: 'Break', icon: 'coffee-outline' },
  { kind: 'rest', label: 'Rest', icon: 'sleep' },
];

/**
 * The driving-hours clock where a driver needs it: on the navigation screen. A small line shows what they are doing and the
 * driving left; one tap opens four large buttons, one tap changes it and closes it again. Nothing to type, and no need to
 * leave the map. Advice only, like the full screen it mirrors.
 */
export function HoursQuickBar() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const log = useShiftStore((s) => s.log);
  const rules = useShiftStore((s) => s.rules);
  const extensionsLeft = useShiftStore((s) => s.extensionsLeft);
  const record = useShiftStore((s) => s.record);
  const [open, setOpen] = useState(false);

  // Re-read the clock every 30 seconds so the countdown moves.
  const [now, setNow] = useState(clockNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(clockNow()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const status = hoursStatus(log, now, { rules, extensionsLeft });
  const summary = quickSummary(status);
  const doing = currentActivity(log)?.kind;

  const choose = (kind: ActivityKind | 'finish'): void => {
    const at = clockNow();
    setNow(at);
    void record(kind, at);
    setOpen(false);
  };

  return (
    <View style={styles.wrap} testID="hours-quick-bar">
      {open && (
        <View style={styles.choices}>
          <View style={styles.row}>
            {CHOICES.map((c) => {
              const active = doing === c.kind;
              return (
                <TouchableOpacity
                  key={c.kind}
                  style={[styles.choice, active && styles.choiceActive]}
                  onPress={() => choose(c.kind)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  testID={`quick-${c.kind}`}
                >
                  <Icon
                    name={c.icon}
                    size={26}
                    color={active ? colors.textOnAccent : colors.text}
                  />
                  <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {doing !== undefined && (
            <TouchableOpacity
              onPress={() => choose('finish')}
              accessibilityRole="button"
              testID="quick-finish"
              style={styles.finish}
            >
              <Text style={styles.finishText}>Finish for now</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <TouchableOpacity
        style={styles.pill}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel="Driving hours"
        testID="hours-quick-toggle"
      >
        <Icon
          name="timer-outline"
          size={22}
          color={summary.urgent ? colors.warning : colors.accent}
        />
        <Text style={[styles.pillText, summary.urgent && styles.urgent]}>{summary.text}</Text>
        <Icon name={open ? 'chevron-down' : 'chevron-up'} size={22} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { alignSelf: 'stretch', gap: 8 },
    pill: {
      ...cardStyle(colors),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      minHeight: 48,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    pillText: { fontSize: 16, fontWeight: '700', color: colors.text },
    urgent: { color: colors.warning },
    choices: { ...cardStyle(colors), padding: 8, gap: 8 },
    row: { flexDirection: 'row', gap: 8 },
    choice: {
      flex: 1,
      minHeight: 72,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      borderRadius: 12,
      backgroundColor: colors.background,
    },
    choiceActive: { backgroundColor: colors.accent },
    choiceText: { fontSize: 13, fontWeight: '700', color: colors.text },
    choiceTextActive: { color: colors.textOnAccent },
    finish: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    finishText: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  });
}
