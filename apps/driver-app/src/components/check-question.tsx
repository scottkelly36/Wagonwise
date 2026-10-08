import type { CheckItem } from '@wagonwise/contracts/checks';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useCheckPhoto } from '../hooks/use-check-photo';
import { isDefect, numberFromText, wantsPhoto, type AnswerState } from '../lib/check-flow';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle, radius } from '../theme/tokens';
import { Icon } from './ui/icon';

interface Props {
  readonly item: CheckItem;
  readonly state: AnswerState | undefined;
  readonly onChange: (next: AnswerState) => void;
}

/**
 * One question of a walk-round check. Built for a driver in a yard with gloves on or a phone in a cold hand: big
 * buttons, no small taps, no typing unless the question needs a number or a note. A defect asks what is wrong and,
 * if the question wants it, for a photo.
 */
export function CheckQuestion({ item, state, onChange }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const camera = useCheckPhoto();
  const [numberText, setNumberText] = useState(
    typeof state?.value === 'number' ? String(state.value) : '',
  );
  const defect = isDefect(item, state);
  const showPhoto = wantsPhoto(item, state);

  const choose = (value: string) => onChange({ ...state, value });
  const takePhoto = async () => {
    const photo = await camera.take();
    if (photo !== undefined) onChange({ ...state, photo });
  };

  const choiceButton = (value: string, label: string, bad: boolean) => {
    const chosen = state?.value === value;
    return (
      <TouchableOpacity
        key={value}
        style={[
          styles.choice,
          chosen && (bad ? styles.choiceBad : styles.choiceGood),
          !chosen && styles.choiceIdle,
        ]}
        onPress={() => choose(value)}
        accessibilityRole="button"
        accessibilityState={{ selected: chosen }}
        testID={`check-${item.id}-${value}`}
      >
        <Text style={[styles.choiceText, chosen && styles.choiceTextChosen]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.card} testID={`check-question-${item.id}`}>
      <Text style={styles.label}>
        {item.label}
        {item.required ? ' *' : ''}
      </Text>
      {item.help !== undefined && <Text style={styles.help}>{item.help}</Text>}

      {item.kind === 'pass_fail' && (
        <View style={styles.row}>
          {choiceButton('ok', 'OK', false)}
          {choiceButton('defect', 'Defect', true)}
        </View>
      )}

      {item.kind === 'yes_no' && (
        <View style={styles.row}>
          {choiceButton('yes', 'Yes', item.defectWhen === 'yes')}
          {choiceButton('no', 'No', item.defectWhen === 'no')}
        </View>
      )}

      {item.kind === 'number' && (
        <View>
          <View style={styles.numberRow}>
            <TextInput
              style={styles.input}
              value={numberText}
              keyboardType="decimal-pad"
              onChangeText={(text) => {
                setNumberText(text);
                onChange({ ...state, value: numberFromText(text) });
              }}
              placeholder="Type a number"
              placeholderTextColor={colors.textDim}
              testID={`check-${item.id}-number`}
            />
            {item.unit !== undefined && <Text style={styles.unit}>{item.unit}</Text>}
          </View>
          {defect && (
            <Text style={styles.warning}>
              That is outside what is expected
              {item.min !== undefined && item.max !== undefined
                ? ` (${item.min} to ${item.max})`
                : item.min !== undefined
                  ? ` (at least ${item.min})`
                  : item.max !== undefined
                    ? ` (at most ${item.max})`
                    : ''}
              . It will be reported.
            </Text>
          )}
        </View>
      )}

      {item.kind === 'note' && (
        <TextInput
          style={[styles.input, styles.multiline]}
          multiline
          value={typeof state?.value === 'string' ? state.value : ''}
          onChangeText={(text) => onChange({ ...state, value: text })}
          placeholder="Type here"
          placeholderTextColor={colors.textDim}
          testID={`check-${item.id}-note`}
        />
      )}

      {item.kind !== 'note' && item.kind !== 'number' && defect && (
        <TextInput
          style={[styles.input, styles.multiline]}
          multiline
          value={state?.note ?? ''}
          onChangeText={(text) => onChange({ ...state, note: text })}
          placeholder="What is wrong?"
          placeholderTextColor={colors.textDim}
          testID={`check-${item.id}-defect-note`}
        />
      )}

      {showPhoto && (
        <View>
          <TouchableOpacity
            style={[styles.photoButton, camera.busy && styles.disabled]}
            disabled={camera.busy}
            onPress={() => void takePhoto()}
            accessibilityRole="button"
            testID={`check-${item.id}-photo`}
          >
            {camera.busy ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <View style={styles.photoContent}>
                <Icon
                  name={state?.photo === undefined ? 'camera' : 'check-circle'}
                  size={22}
                  color={state?.photo === undefined ? colors.text : colors.accentGreen}
                />
                <Text style={styles.photoText}>
                  {state?.photo === undefined
                    ? item.kind === 'photo'
                      ? 'Take photo'
                      : 'Add a photo'
                    : 'Photo taken. Tap to retake'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          {camera.error !== undefined && <Text style={styles.warning}>{camera.error}</Text>}
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: { ...cardStyle(colors), padding: 14, gap: 10 },
    label: { fontSize: 18, fontWeight: '600', color: colors.text },
    help: { fontSize: 14, color: colors.textMuted },
    row: { flexDirection: 'row', gap: 10 },
    choice: {
      flex: 1,
      minHeight: 56,
      borderRadius: radius.badge,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
    },
    choiceIdle: { borderColor: colors.divider, backgroundColor: colors.surface },
    choiceGood: { borderColor: colors.accentGreen, backgroundColor: colors.accentGreen },
    choiceBad: { borderColor: colors.danger, backgroundColor: colors.danger },
    choiceText: { fontSize: 18, fontWeight: '600', color: colors.text },
    choiceTextChosen: { color: colors.textOnAccent },
    numberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    input: {
      flex: 1,
      minHeight: 52,
      borderRadius: radius.badge,
      paddingHorizontal: 14,
      fontSize: 18,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    multiline: { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' },
    unit: { fontSize: 16, color: colors.textMuted },
    warning: { fontSize: 14, color: colors.warning, marginTop: 6 },
    photoButton: {
      minHeight: 52,
      borderRadius: radius.badge,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    photoContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    photoText: { fontSize: 16, fontWeight: '600', color: colors.text },
    disabled: { opacity: 0.5 },
  });
}
