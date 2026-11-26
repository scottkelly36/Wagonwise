import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCardRead } from '../hooks/use-card-read';
import { ScreenHeader } from '../components/ui/screen-header';
import { sizeText } from '../lib/tachograph-card/card-flow';
import { SCENARIOS } from '../lib/tachograph-card/scenarios';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';

/**
 * Read my card, with a PRETEND card. For test builds only (More shows it only there): it runs the same reading logic a real card reader
 * will use against a simulated card, so every outcome can be watched on a phone with no reader and no card. Nothing is sent anywhere
 * and nothing real is read. When a real reader exists, this screen reads from it and ends in sending the file to the firm.
 */
export default function ReadCardScreen() {
  const { state, start, cancel, reset } = useCardRead();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0]?.id ?? '');
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  const busy = state.status === 'reading';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="Read my card (test)" />
        <View style={styles.notice} testID="read-card-notice">
          <Text style={styles.noticeText}>
            This reads a pretend card. Nothing real is read and nothing is sent anywhere. It is here
            so the steps can be tried before a real card reader is connected.
          </Text>
        </View>

        <Text style={styles.heading}>Pick a pretend card</Text>
        {SCENARIOS.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={[styles.choice, s.id === scenarioId && styles.choiceOn]}
            disabled={busy}
            onPress={() => {
              setScenarioId(s.id);
              reset();
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: s.id === scenarioId, disabled: busy }}
            testID={`scenario-${s.id}`}
          >
            <Text style={styles.choiceLabel}>{s.label}</Text>
            <Text style={styles.small}>{s.expect}</Text>
          </TouchableOpacity>
        ))}

        {busy ? (
          <View style={styles.card} testID="read-card-progress">
            <Text style={styles.heading}>Reading the card…</Text>
            <View style={styles.bar}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.round((state.step / state.steps) * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.body}>
              {state.file} ({state.step} of {state.steps})
            </Text>
            <TouchableOpacity onPress={cancel} accessibilityRole="button" testID="read-card-cancel">
              <Text style={styles.link}>Stop</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.button}
            onPress={() => scenario !== undefined && void start(scenario)}
            accessibilityRole="button"
            testID="read-card-start"
          >
            <Text style={styles.buttonText}>Read the card</Text>
          </TouchableOpacity>
        )}

        {state.status === 'failed' && (
          <Text style={styles.error} testID="read-card-error">
            {state.message}
          </Text>
        )}

        {state.status === 'done' && (
          <View style={styles.card} testID="read-card-done">
            <Text style={styles.heading}>Card read</Text>
            <Text style={styles.body}>
              {state.summary.fileName}, {sizeText(state.summary.totalBytes)}.{' '}
              {state.summary.signedCount} of {state.summary.files.length} parts were signed by the
              card.
              {state.summary.skippedCount > 0
                ? ` ${state.summary.skippedCount} optional part was not on this card.`
                : ''}
            </Text>
            {state.summary.files.map((f) => (
              <Text key={f.name} style={styles.small}>
                {f.skipped ? '–' : f.signed ? '✓' : '·'} {f.name}
                {f.skipped ? ' (not on this card)' : ` (${sizeText(f.bytes)})`}
              </Text>
            ))}
            <Text style={styles.small}>
              The file is kept exactly as the card gave it. Nothing in it has been read or checked
              yet.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 12 },
    notice: { padding: 14, borderRadius: radius.card, backgroundColor: colors.accentSoft },
    noticeText: { fontSize: 15, lineHeight: 21, color: colors.text },
    heading: { fontSize: 18, fontWeight: '700', color: colors.text },
    body: { fontSize: 15, lineHeight: 21, color: colors.textSecondary },
    small: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
    link: { fontSize: 15, fontWeight: '600', color: colors.accentBlue },
    error: { fontSize: 15, lineHeight: 21, color: colors.danger },
    choice: { gap: 2, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface },
    choiceOn: { borderWidth: 2, borderColor: colors.accent },
    choiceLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
    card: { gap: 8, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface },
    bar: { height: 10, borderRadius: 5, backgroundColor: colors.background, overflow: 'hidden' },
    barFill: { height: 10, backgroundColor: colors.accent },
    button: {
      minHeight: 52,
      borderRadius: radius.card,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    buttonText: { fontSize: 16, fontWeight: '800', color: colors.textOnAccent },
  });
}
