import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  SIGNATURE_HEIGHT,
  SIGNATURE_WIDTH,
  type AttachSignatureRequest,
} from '@wagonwise/contracts/jobs';
import { prepareSignature, segmentsFor, type PadPoint } from '../lib/signature';
import { useThemeColors, type ThemeColors } from '../theme/colors';

const LINE_WIDTH = 3;
/** A new point is added only after the finger has moved this far (in pixels): fewer pieces to draw, same line. */
const MIN_MOVE = 2;

interface Props {
  readonly visible: boolean;
  /** Called with the request to send once the receiver has signed and the driver taps Save. */
  readonly onSave: (signature: AttachSignatureRequest) => void;
  readonly onCancel: () => void;
}

/**
 * Where the receiver signs with a finger. The app has no drawing library, so the line is kept as the points the finger
 * passed through and drawn as thin rotated rectangles; the same points (scaled to a 1000 x 500 box) are what gets sent,
 * and the dashboard draws them again as a clean line.
 */
export function SignaturePad({ visible, onSave, onCancel }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [strokes, setStrokes] = useState<readonly (readonly PadPoint[])[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [name, setName] = useState('');
  const [tooLittle, setTooLittle] = useState(false);

  function pointOf(event: GestureResponderEvent): PadPoint {
    return { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
  }

  function begin(event: GestureResponderEvent): void {
    setTooLittle(false);
    setStrokes((current) => [...current, [pointOf(event)]]);
  }

  function move(event: GestureResponderEvent): void {
    const point = pointOf(event);
    setStrokes((current) => {
      const last = current.at(-1);
      const previous = last?.at(-1);
      if (last === undefined || previous === undefined) return current;
      if (Math.hypot(point.x - previous.x, point.y - previous.y) < MIN_MOVE) return current;
      return [...current.slice(0, -1), [...last, point]];
    });
  }

  function clear(): void {
    setStrokes([]);
    setTooLittle(false);
  }

  function save(): void {
    const signature = prepareSignature(strokes, size, name);
    if (signature === undefined) {
      setTooLittle(true);
      return;
    }
    onSave(signature);
    setStrokes([]);
    setName('');
  }

  function cancel(): void {
    setStrokes([]);
    setName('');
    setTooLittle(false);
    onCancel();
  }

  const segments = segmentsFor(strokes);
  const lonePoints = strokes.filter((s) => s.length === 1).map((s) => s[0]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cancel} testID="signature-modal">
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Text style={styles.title}>Receiver’s signature</Text>
          <Text style={styles.hint}>
            Hand the phone to the receiver and ask them to sign below.
          </Text>

          <View
            style={[styles.pad, { aspectRatio: SIGNATURE_WIDTH / SIGNATURE_HEIGHT }]}
            onLayout={(e: LayoutChangeEvent) =>
              setSize({
                width: e.nativeEvent.layout.width,
                height: e.nativeEvent.layout.height,
              })
            }
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
            onResponderGrant={begin}
            onResponderMove={move}
            testID="signature-pad"
          >
            <View style={styles.baseline} pointerEvents="none" />
            {segments.map((segment) => (
              <View
                key={segment.key}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: segment.cx - (segment.length + LINE_WIDTH) / 2,
                  top: segment.cy - LINE_WIDTH / 2,
                  // A little longer than the piece, so neighbouring pieces overlap into one smooth line.
                  width: segment.length + LINE_WIDTH,
                  height: LINE_WIDTH,
                  borderRadius: LINE_WIDTH / 2,
                  backgroundColor: PEN,
                  transform: [{ rotate: `${segment.angle}deg` }],
                }}
              />
            ))}
            {lonePoints.map((point, i) =>
              point === undefined ? null : (
                <View
                  key={`dot-${i}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: point.x - LINE_WIDTH / 2,
                    top: point.y - LINE_WIDTH / 2,
                    width: LINE_WIDTH,
                    height: LINE_WIDTH,
                    borderRadius: LINE_WIDTH / 2,
                    backgroundColor: PEN,
                  }}
                />
              ),
            )}
          </View>
          {tooLittle && (
            <Text style={styles.error} testID="signature-too-little">
              Ask them to sign again. There is not enough to keep yet.
            </Text>
          )}

          <Text style={styles.label}>Name (optional)</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Print their name"
            placeholderTextColor={colors.textDim}
            maxLength={80}
            testID="signature-name-input"
          />

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.secondary} onPress={clear} testID="signature-clear">
              <Text style={styles.secondaryText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={cancel} testID="signature-cancel">
              <Text style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primary} onPress={save} testID="signature-save">
              <Text style={styles.primaryText}>Save</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

/** The pad is always white paper with dark ink, whatever the app theme, so the line looks like a real signature. */
const PAPER = '#ffffff';
const PEN = '#111111';

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    body: { flex: 1, padding: 16, gap: 8 },
    title: { fontSize: 24, fontWeight: '700', color: colors.text },
    hint: { fontSize: 16, color: colors.textMuted, marginBottom: 8 },
    pad: {
      width: '100%',
      backgroundColor: PAPER,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.accent,
      overflow: 'hidden',
    },
    baseline: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: '25%',
      height: 1,
      backgroundColor: '#999999',
    },
    label: { fontSize: 16, color: colors.textMuted, marginTop: 12 },
    input: {
      minHeight: 56,
      fontSize: 20,
      color: colors.text,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 16,
    },
    error: { fontSize: 16, color: colors.danger },
    buttons: { flexDirection: 'row', gap: 12, marginTop: 16 },
    secondary: {
      flex: 1,
      minHeight: 56,
      borderRadius: 16,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    secondaryText: { fontSize: 18, fontWeight: '700', color: colors.text },
    primary: {
      flex: 1.4,
      minHeight: 56,
      borderRadius: 16,
      backgroundColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    primaryText: { fontSize: 18, fontWeight: '700', color: colors.textOnAccent },
  });
}
