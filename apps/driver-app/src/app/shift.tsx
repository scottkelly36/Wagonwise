import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../components/ui/icon';
import { ScreenHeader } from '../components/ui/screen-header';
import {
  durationText,
  hoursStatus,
  type ActivityKind,
  type HoursStatus,
  type RuleSet,
} from '../lib/driver-hours';
import { currentActivity } from '../lib/shift-log';
import { useShiftStore } from '../state/shift-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle, radius } from '../theme/tokens';

const clockNow = (): number => Date.now();

const BUTTONS: { kind: ActivityKind; label: string; icon: IconName }[] = [
  { kind: 'driving', label: 'Driving', icon: 'steering' },
  { kind: 'other_work', label: 'Other work', icon: 'package-variant-closed' },
  { kind: 'break', label: 'Break', icon: 'coffee-outline' },
  { kind: 'rest', label: 'Rest', icon: 'sleep' },
];

const STATE_TEXT: Record<HoursStatus['state'], string> = {
  idle: 'Not on a shift',
  driving: 'Driving',
  working: 'Other work',
  on_break: 'On a break',
};

const LIMIT_TEXT: Record<HoursStatus['limit'], string> = {
  daily: 'the day’s limit',
  weekly: 'the week’s limit',
  fortnightly: 'the fortnight’s limit',
};

const RULE_TEXT: Record<RuleSet, string> = {
  assimilated_eu: 'EU / assimilated rules (9 hours a day, a break after 4h 30m)',
  gb_domestic: 'GB domestic rules (10 hours driving a day)',
};

/**
 * Driving hours: the driver taps what they are doing (driving, other work, break, rest) and the app counts down the
 * time to the next break and to the day's limit. It is advice only: the tachograph is the legal record, and the driver
 * is responsible. Nothing here leaves the phone. A tachograph can feed this same screen later.
 */
export default function ShiftScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { log, rules, extensionsLeft, record, setRules, setExtensionsLeft, clear } =
    useShiftStore();

  // Re-read the clock every 30 seconds so the countdown moves while the screen is open.
  const [now, setNow] = useState(clockNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(clockNow()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const status = hoursStatus(log, now, { rules, extensionsLeft });
  const open = currentActivity(log);
  const urgent = status.drivingLeftMs < 30 * 60_000;

  const tap = (kind: ActivityKind | 'finish'): void => {
    const at = clockNow();
    setNow(at);
    void record(kind, at);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="Driving hours" subtitle="Advice only" fallbackHref="/more" />

        <View style={styles.card} testID="hours-status">
          <Text style={styles.state}>{STATE_TEXT[status.state]}</Text>
          {status.untilBreakMs === null ? (
            <Text style={styles.line}>
              Driving left today:{' '}
              <Text style={styles.strong}>{durationText(status.untilDailyLimitMs)}</Text>
            </Text>
          ) : (
            <>
              <Text style={[styles.big, urgent && styles.urgent]} testID="hours-left">
                {durationText(status.drivingLeftMs)}
              </Text>
              <Text style={styles.line}>
                of driving left before{' '}
                {status.next === 'break' ? 'your next break' : LIMIT_TEXT[status.limit]}
              </Text>
              <Text style={styles.line}>
                Driven since your last break:{' '}
                <Text style={styles.strong}>{durationText(status.drivingSinceBreakMs)}</Text>
              </Text>
              <Text style={styles.line}>
                Driven today:{' '}
                <Text style={styles.strong}>
                  {durationText(status.dailyDrivingMs)} of {durationText(status.dailyLimitMs)}
                </Text>
              </Text>
              {status.untilWeeklyLimitMs !== null && (
                <Text style={styles.line}>
                  This week (from Monday):{' '}
                  <Text style={styles.strong}>{durationText(status.weeklyDrivingMs)} of 56h</Text>
                  {'; '}
                  this and last week:{' '}
                  <Text style={styles.strong}>
                    {durationText(status.fortnightDrivingMs)} of 90h
                  </Text>
                </Text>
              )}
            </>
          )}
        </View>

        <Text style={styles.label}>What are you doing now?</Text>
        <View style={styles.buttons}>
          {BUTTONS.map((b) => {
            const active = open?.kind === b.kind;
            return (
              <TouchableOpacity
                key={b.kind}
                style={[styles.button, active && styles.buttonActive]}
                onPress={() => tap(b.kind)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                testID={`shift-${b.kind}`}
              >
                <Icon name={b.icon} size={28} color={active ? colors.textOnAccent : colors.text} />
                <Text style={[styles.buttonText, active && styles.buttonTextActive]}>
                  {b.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          style={styles.finish}
          onPress={() => tap('finish')}
          disabled={open === undefined}
          accessibilityRole="button"
          testID="shift-finish"
        >
          <Text style={styles.finishText}>Finish for now</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Which rules?</Text>
        {(Object.keys(RULE_TEXT) as RuleSet[]).map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.option, rules === r && styles.optionActive]}
            onPress={() => void setRules(r)}
            accessibilityRole="button"
            accessibilityState={{ selected: rules === r }}
            testID={`rules-${r}`}
          >
            <Text style={styles.optionText}>{RULE_TEXT[r]}</Text>
          </TouchableOpacity>
        ))}
        {rules === 'assimilated_eu' && (
          <View style={styles.option}>
            <Text style={styles.optionText}>
              10-hour days still unused this week:{' '}
              <Text style={styles.strong}>{extensionsLeft}</Text> (the app plans on 9 hours unless
              you have one left)
            </Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.step}
                onPress={() => void setExtensionsLeft(extensionsLeft - 1)}
                accessibilityLabel="One fewer"
              >
                <Text style={styles.stepText}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.step}
                onPress={() => void setExtensionsLeft(extensionsLeft + 1)}
                accessibilityLabel="One more"
              >
                <Text style={styles.stepText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={styles.note}>
          This is a guide, not a record. Your tachograph is the legal record and you are responsible
          for staying within the rules. Weekly rest and reduced daily rests are not counted here
          yet. What you tap stays on this phone and is kept for 15 days.
        </Text>
        <TouchableOpacity
          onPress={() => void clear()}
          accessibilityRole="button"
          testID="shift-clear"
        >
          <Text style={styles.clear}>Clear what is recorded on this phone</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 14 },
    card: { ...cardStyle(colors), padding: 16, gap: 6 },
    state: { fontSize: 16, fontWeight: '700', color: colors.textMuted },
    big: { fontSize: 56, fontWeight: '800', color: colors.text },
    urgent: { color: colors.danger },
    line: { fontSize: 16, color: colors.textSecondary },
    strong: { fontWeight: '700', color: colors.text },
    label: { fontSize: 15, fontWeight: '700', color: colors.textMuted, marginTop: 4 },
    buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    button: {
      flexBasis: '47%',
      flexGrow: 1,
      minHeight: 72,
      borderRadius: radius.badge,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    buttonActive: { backgroundColor: colors.accent },
    buttonText: { fontSize: 16, fontWeight: '700', color: colors.text },
    buttonTextActive: { color: colors.textOnAccent },
    finish: { alignItems: 'center', padding: 12 },
    finishText: { fontSize: 16, fontWeight: '700', color: colors.accentBlue },
    option: { ...cardStyle(colors), padding: 14, gap: 8 },
    optionActive: { borderWidth: 2, borderColor: colors.accent },
    optionText: { fontSize: 15, color: colors.textSecondary },
    stepper: { flexDirection: 'row', gap: 10 },
    step: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepText: { fontSize: 24, fontWeight: '700', color: colors.text },
    note: { fontSize: 13, color: colors.textDim },
    clear: { fontSize: 14, color: colors.textMuted, textDecorationLine: 'underline' },
  });
}
