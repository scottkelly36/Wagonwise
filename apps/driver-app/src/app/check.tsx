import { submitCheckRequestSchema } from '@wagonwise/contracts/checks';
import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useChecksDue } from '../api/use-checks';
import { CheckQuestion } from '../components/check-question';
import { ScreenHeader } from '../components/ui/screen-header';
import { enqueueCheck } from '../db/check-queue';
import { useAccessToken } from '../hooks/use-access-token';
import { PENDING_CHECKS_KEY, syncCheckQueue } from '../hooks/use-check-queue-flush';
import {
  buildAnswers,
  canFinish,
  localResult,
  missingRequired,
  photosToSend,
  RESULT_TEXT,
  type AnswerState,
  type Answers,
  type LocalResult,
} from '../lib/check-flow';
import { dueRows } from '../lib/check-due';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle, radius } from '../theme/tokens';

const SAVE_FAILED = "Couldn't save the check on your phone. Try again.";

/**
 * The daily walk-round check, on the vehicle for the driver's current job. Each firm builds its own lists, so this
 * shows whatever the firm asked: a driver works down the questions with big buttons, flags anything wrong (with a
 * note and, if the firm wants one, a photo), and finishes. The finished check is saved on the phone first and sent
 * when there is signal, so a patchy yard doesn't lose it; either way the driver is told straight away what the
 * result means, and a "do not drive" defect says so plainly.
 */
export default function CheckScreen() {
  const router = useRouter();
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const { view, isPending } = useChecksDue();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [chosenId, setChosenId] = useState<string | undefined>(undefined);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<LocalResult | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  if (isPending) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.text} />
      </SafeAreaView>
    );
  }

  const due = view === undefined ? [] : dueRows(view);
  const selected =
    due.find((r) => r.template.id === chosenId) ?? (due.length === 1 ? due[0] : undefined);

  if (result !== undefined) {
    const text = RESULT_TEXT[result.result];
    const next = due.length > 0;
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View
            style={[styles.resultCard, result.result === 'do_not_drive' && styles.resultStop]}
            testID="check-result"
          >
            <Text style={styles.resultTitle}>{text.title}</Text>
            <Text style={styles.resultBody}>{text.body}</Text>
            {result.defects.map((d) => (
              <Text key={d.label} style={styles.resultDefect}>
                {d.severity === 'do_not_drive' ? 'Do not drive: ' : 'Fix soon: '}
                {d.label}
              </Text>
            ))}
          </View>
          <Text style={styles.sent}>
            Saved. If you have no signal it will be sent as soon as you do.
          </Text>
          <TouchableOpacity
            style={styles.primary}
            onPress={() => {
              setResult(undefined);
              setAnswers({});
              setChosenId(undefined);
              if (!next) router.back();
            }}
            testID="check-result-done"
          >
            <Text style={styles.primaryText}>{next ? 'Next check' : 'Done'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (view === undefined || view.vehicle === null || due.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ScreenHeader title="Daily check" />
          <Text style={styles.empty} testID="check-nothing">
            {view?.vehicle == null
              ? 'There is no vehicle to check yet. Your check will show once dispatch gives you a job with a vehicle.'
              : 'All checks are done for this vehicle today.'}
          </Text>
          <TouchableOpacity style={styles.primary} onPress={() => router.back()}>
            <Text style={styles.primaryText}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (selected === undefined) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ScreenHeader title="Daily check" subtitle={view.vehicle.name} />
          <Text style={styles.empty}>Which check are you doing?</Text>
          {due.map((row) => (
            <TouchableOpacity
              key={row.template.id}
              style={styles.listChoice}
              onPress={() => setChosenId(row.template.id)}
              testID={`check-list-${row.template.id}`}
            >
              <Text style={styles.listChoiceText}>{row.template.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const { template } = selected;
  const vehicle = view.vehicle;
  const items = template.items;
  const missing = missingRequired(items, answers);
  const ready = canFinish(items, answers);

  async function finish(): Promise<void> {
    if (!ready || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      const request = submitCheckRequestSchema.parse({
        id: Crypto.randomUUID(),
        templateId: template.id,
        vehicleId: vehicle.id,
        answers: buildAnswers(items, answers),
        completedAt: new Date().toISOString(),
      });
      await enqueueCheck({
        request,
        photos: photosToSend(items, answers).map(({ itemId, photo }) => ({ itemId, ...photo })),
      });
      setResult(localResult(items, answers));
      await queryClient.invalidateQueries({ queryKey: PENDING_CHECKS_KEY });
      void syncCheckQueue(accessToken);
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title={template.name} subtitle={vehicle.name} />
        {items.map((item) => (
          <CheckQuestion
            key={item.id}
            item={item}
            state={answers[item.id]}
            onChange={(next: AnswerState) => setAnswers((all) => ({ ...all, [item.id]: next }))}
          />
        ))}
        {error !== undefined && <Text style={styles.error}>{error}</Text>}
        {!ready && (
          <Text style={styles.hint} testID="check-missing">
            {missing.length === 1
              ? '1 question still to answer.'
              : `${missing.length} questions still to answer.`}
          </Text>
        )}
        <TouchableOpacity
          style={[styles.primary, (!ready || saving) && styles.disabled]}
          disabled={!ready || saving}
          onPress={() => void finish()}
          testID="check-finish"
        >
          {saving ? (
            <ActivityIndicator color={colors.textOnAccent} />
          ) : (
            <Text style={styles.primaryText}>Finish check</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 14 },
    empty: { fontSize: 18, color: colors.textSecondary },
    hint: { fontSize: 15, color: colors.textMuted },
    error: { fontSize: 15, color: colors.danger },
    primary: {
      minHeight: 60,
      borderRadius: radius.badge,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: { fontSize: 20, fontWeight: '700', color: colors.textOnAccent },
    disabled: { opacity: 0.4 },
    listChoice: { ...cardStyle(colors), padding: 18, minHeight: 64, justifyContent: 'center' },
    listChoiceText: { fontSize: 20, fontWeight: '600', color: colors.text },
    resultCard: { ...cardStyle(colors), padding: 20, gap: 8 },
    resultStop: { borderWidth: 3, borderColor: colors.danger },
    resultTitle: { fontSize: 26, fontWeight: '700', color: colors.text },
    resultBody: { fontSize: 18, color: colors.textSecondary },
    resultDefect: { fontSize: 17, fontWeight: '600', color: colors.danger },
    sent: { fontSize: 14, color: colors.textMuted },
  });
}
