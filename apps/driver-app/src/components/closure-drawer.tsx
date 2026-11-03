import type { ClosureDto } from '@wagonwise/contracts/closures';
import { useMemo } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CLOSURE_CAVEAT,
  CLOSURES_CREDIT,
  causeText,
  closureTitle,
  directionText,
  shutText,
  statusLabel,
  timingLines,
  windowNote,
} from '../lib/closure-details';
import { updatedText } from '../lib/fuel-details';
import { shortDistance } from '../lib/uk-distance';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';
import { closureColour } from './closure-colour';
import { Icon } from './ui/icon';

/** A closure from the map (which says how far away it is) or from a planned route (which does not: it is on the route). */
type DrawerClosure = Omit<ClosureDto, 'distanceM'> & { readonly distanceM?: number | undefined };

interface Props {
  /** The tapped closure, or undefined when the drawer is closed. */
  readonly closure: DrawerClosure | undefined;
  readonly onClose: () => void;
}

/**
 * A road or lane closure as a bottom drawer, the same pattern as `FuelStationDrawer`. The closure is already in the list the map
 * drew its marker from, so there is nothing to fetch. It says what National Highways says, what is shut, and when: for one in force
 * how long is left, for a planned one when it starts and how long it lasts.
 */
export function ClosureDrawer({ closure, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const now = new Date();

  const direction = closure === undefined ? undefined : directionText(closure.direction);
  const cause = closure === undefined ? undefined : causeText(closure.cause);
  const note = closure === undefined ? undefined : windowNote(closure);

  return (
    <Modal
      visible={closure !== undefined}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <View style={styles.badge}>
              <Icon
                name="account-hard-hat"
                size={32}
                color={closure === undefined ? colors.text : closureColour(closure.kind)}
              />
            </View>
            <View style={styles.titleText}>
              <Text style={styles.title} numberOfLines={2}>
                {closure === undefined ? 'Closure' : closureTitle(closure)}
              </Text>
              <Text style={styles.status} testID="closure-status">
                {closure === undefined ? '' : statusLabel(closure)}
              </Text>
            </View>
          </View>

          {closure !== undefined && (
            <>
              <Text style={styles.description} testID="closure-description">
                {closure.description}
              </Text>
              <Text style={styles.shut}>{shutText(closure)}</Text>

              <View style={styles.timing} testID="closure-timing">
                {timingLines(closure, now).map((line, i) => (
                  <Text key={line} style={i === 0 ? styles.timingFirst : styles.timingLine}>
                    {line}
                  </Text>
                ))}
              </View>
              {note !== undefined && (
                <Text style={styles.note} testID="closure-window-note">
                  {note}
                </Text>
              )}

              {closure.locationText !== undefined && (
                <Text style={styles.detail}>{closure.locationText}</Text>
              )}
              <Text style={styles.detail}>
                {[
                  direction,
                  cause,
                  closure.distanceM === undefined
                    ? undefined
                    : `${shortDistance(closure.distanceM)} away`,
                ]
                  .filter((part): part is string => part !== undefined)
                  .join(' · ')}
              </Text>
              <Text style={styles.meta}>{updatedText(closure.updatedAt, now)}</Text>
              <Text style={styles.meta}>{CLOSURE_CAVEAT}</Text>
              <Text style={styles.meta}>{CLOSURES_CREDIT}</Text>
            </>
          )}

          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            testID="closure-drawer-close"
          >
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, justifyContent: 'flex-end' },
    // Fixed black in both themes, as on the hazard, parking and fuel drawers.
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
      gap: 4,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.surfaceStrong,
      marginBottom: 16,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    badge: {
      width: 52,
      height: 52,
      borderRadius: radius.badge,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    titleText: { flex: 1 },
    title: { fontSize: 24, fontWeight: '700', color: colors.text },
    status: { fontSize: 14, color: colors.textMuted, textTransform: 'uppercase' },
    description: { fontSize: 18, fontWeight: '600', color: colors.text, marginTop: 14 },
    shut: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, marginTop: 4 },
    timing: { marginTop: 12, gap: 2 },
    timingFirst: { fontSize: 22, fontWeight: '800', color: colors.text },
    timingLine: { fontSize: 17, fontWeight: '600', color: colors.textSecondary },
    note: { fontSize: 14, color: colors.textMuted, marginTop: 8 },
    detail: { fontSize: 16, color: colors.textSecondary, marginTop: 8 },
    meta: { fontSize: 14, color: colors.textDim, marginTop: 8 },
    closeButton: {
      marginTop: 20,
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.textDim,
      justifyContent: 'center',
      alignItems: 'center',
    },
    closeText: { fontSize: 18, fontWeight: '700', color: colors.text },
  });
}
