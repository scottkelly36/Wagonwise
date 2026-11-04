import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '../components/ui/icon';
import { WALKTHROUGH_CLOSING, WALKTHROUGH_STEPS } from '../lib/walkthrough-steps';
import { PRODUCT_NAME } from '../product';
import { useWalkthroughStore } from '../state/walkthrough-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';

/**
 * The first-run tour: a few screens on what the app does and where to find it. Reached from `index.tsx`'s gate once on a new phone
 * (after the privacy screen, and never ahead of a trip in progress), and from More, "How it works", whenever a driver wants it again.
 * Skipping and finishing do the same thing, so nobody is held here.
 */
export default function WalkthroughScreen() {
  const router = useRouter();
  const markSeen = useWalkthroughStore((s) => s.markSeen);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [index, setIndex] = useState(0);

  const step = WALKTHROUGH_STEPS[index];
  const isLast = index === WALKTHROUGH_STEPS.length - 1;
  if (!step) return null;

  function leave(): void {
    // Re-enters index.tsx's gate, which now sees the tour as seen and moves on to the trip or the map.
    void markSeen().then(() => router.replace('/'));
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>{PRODUCT_NAME}</Text>
        {!isLast && (
          <TouchableOpacity
            onPress={leave}
            accessibilityRole="button"
            hitSlop={12}
            testID="walkthrough-skip-button"
          >
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Icon name={step.icon} size={56} color={colors.accent} />
        </View>
        <Text style={styles.title} accessibilityRole="header" testID="walkthrough-title">
          {step.title}
        </Text>
        <Text style={styles.text}>{step.body}</Text>
        {isLast && <Text style={styles.closing}>{WALKTHROUGH_CLOSING}</Text>}
      </View>

      <View style={styles.footer}>
        <View
          style={styles.dots}
          accessibilityLabel={`Step ${index + 1} of ${WALKTHROUGH_STEPS.length}`}
        >
          {WALKTHROUGH_STEPS.map((s, i) => (
            <View key={s.title} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <View style={styles.buttons}>
          {index > 0 && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setIndex(index - 1)}
              accessibilityRole="button"
              testID="walkthrough-back-button"
            >
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.nextButton}
            onPress={isLast ? leave : () => setIndex(index + 1)}
            accessibilityRole="button"
            testID="walkthrough-next-button"
          >
            <Text style={styles.nextText}>{isLast ? 'Get started' : 'Next'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 24 },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: 44,
    },
    brand: { fontSize: 18, fontWeight: '800', color: colors.accent },
    skip: { fontSize: 17, fontWeight: '600', color: colors.textMuted },
    body: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
    iconCircle: {
      width: 112,
      height: 112,
      borderRadius: 56,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },
    title: { fontSize: 26, fontWeight: '800', color: colors.text, textAlign: 'center' },
    text: {
      fontSize: 17,
      lineHeight: 25,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    closing: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 8,
    },
    footer: { gap: 20 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceStrong },
    dotActive: { backgroundColor: colors.accent, width: 24 },
    buttons: { flexDirection: 'row', gap: 12 },
    backButton: {
      minHeight: 56,
      paddingHorizontal: 24,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.divider,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backText: { fontSize: 18, fontWeight: '600', color: colors.text },
    nextButton: {
      flex: 1,
      minHeight: 56,
      backgroundColor: colors.accent,
      borderRadius: radius.card,
      justifyContent: 'center',
      alignItems: 'center',
    },
    nextText: { fontSize: 20, fontWeight: '700', color: colors.textOnAccent },
  });
}
