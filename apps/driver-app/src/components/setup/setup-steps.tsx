import { useMemo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SETUP_STEPS, type VehicleSelection } from '../../lib/lorry-setup';
import { VEHICLE_PRESETS } from '../../lib/vehicle-presets';
import { useThemeColors, type ThemeColors } from '../../theme/colors';
import { radius } from '../../theme/tokens';
import { Icon, type IconName } from '../ui/icon';
import { VehicleDrawing } from '../vehicle-drawing';

/*
 * The guided set-up's steps (first-trip redesign, the design canvas of 2026-11-17): one question a screen, a big Next, and
 * Back underneath. These only draw: `app/setup-lorry.tsx` holds the state and does the saving, so the same parts can be shown
 * in the screenshot preview (`apps/driver-app/preview/`).
 */

function useStyles() {
  const colors = useThemeColors();
  return { colors, styles: useMemo(() => createStyles(colors), [colors]) };
}

/** The bars across the top: one per step, filled up to this one. */
export function StepProgress({ step }: { readonly step: number }) {
  const { styles } = useStyles();
  return (
    <View
      style={styles.progress}
      accessible
      accessibilityLabel={`Step ${step} of ${SETUP_STEPS}`}
      testID="setup-progress"
    >
      {Array.from({ length: SETUP_STEPS }, (_, i) => (
        <View key={i} style={[styles.bar, i < step && styles.barDone]} />
      ))}
    </View>
  );
}

interface FrameProps {
  readonly step: number;
  readonly title: string;
  readonly intro?: string;
  readonly nextLabel?: string;
  readonly nextDisabled?: boolean;
  readonly pending?: boolean;
  readonly error?: string;
  readonly onNext: () => void;
  readonly onBack: () => void;
  readonly above?: ReactNode;
  /** Kept in view just above Next, outside the scrolling choices. */
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}

/** A step: progress, what is already chosen (`above`), the question, its choices, then Next and Back pinned to the bottom. */
export function StepFrame({
  step,
  title,
  intro,
  nextLabel = 'Next',
  nextDisabled = false,
  pending = false,
  error,
  onNext,
  onBack,
  above,
  footer,
  children,
}: FrameProps) {
  const { colors, styles } = useStyles();
  const disabled = nextDisabled || pending;
  return (
    <View style={styles.frame}>
      <StepProgress step={step} />
      {above}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.stepLabel}>{`Step ${step} of ${SETUP_STEPS}`}</Text>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {intro !== undefined && <Text style={styles.intro}>{intro}</Text>}
        {children}
      </ScrollView>
      {footer}
      {error !== undefined && (
        <Text style={styles.error} testID="setup-error">
          {error}
        </Text>
      )}
      <TouchableOpacity
        style={[styles.next, disabled && styles.nextDisabled]}
        onPress={onNext}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        testID="setup-next"
      >
        {pending ? (
          <ActivityIndicator color={colors.textOnAccent} />
        ) : (
          <Text style={styles.nextText}>{nextLabel}</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.back}
        onPress={onBack}
        accessibilityRole="button"
        testID="setup-back"
      >
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}

interface ChoiceProps {
  readonly selected: boolean;
  readonly title: string;
  readonly detail?: string;
  readonly icon?: IconName;
  readonly drawing?: ReactNode;
  readonly onPress: () => void;
  readonly testID: string;
}

/** One answer as a big card with a radio dot: the whole card is the target, sized for a thumb. */
export function ChoiceCard({
  selected,
  title,
  detail,
  icon,
  drawing,
  onPress,
  testID,
}: ChoiceProps) {
  const { colors, styles } = useStyles();
  return (
    <TouchableOpacity
      style={[styles.choice, selected && styles.choiceSelected]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      testID={testID}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      {icon !== undefined && (
        <Icon name={icon} size={24} color={selected ? colors.accentBlue : colors.textMuted} />
      )}
      <View style={styles.choiceText}>
        <Text style={styles.choiceTitle}>{title}</Text>
        {detail !== undefined && <Text style={styles.choiceDetail}>{detail}</Text>}
      </View>
      {drawing}
    </TouchableOpacity>
  );
}

/** What is already set, with Change: shown above the later steps so the driver can see it and go back to it. */
export function DoneRow({
  text,
  onChange,
  testID,
}: {
  readonly text: string;
  readonly onChange: () => void;
  readonly testID: string;
}) {
  const { colors, styles } = useStyles();
  return (
    <TouchableOpacity
      style={styles.done}
      onPress={onChange}
      accessibilityRole="button"
      accessibilityLabel={`${text}. Change`}
      testID={testID}
    >
      <Icon name="check" size={20} color={colors.accentGreen} />
      <Text style={styles.doneText} numberOfLines={1}>
        {text}
      </Text>
      <Text style={styles.link}>Change</Text>
    </TouchableOpacity>
  );
}

interface VehicleStepProps {
  readonly saved: readonly { readonly id: string; readonly name: string }[];
  readonly loadingSaved: boolean;
  readonly selection: VehicleSelection | undefined;
  readonly usual: boolean;
  readonly pending: boolean;
  readonly error?: string;
  readonly onSelect: (selection: VehicleSelection) => void;
  readonly onUsualChange: (usual: boolean) => void;
  readonly onOwnSizes: () => void;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

/** Step 1: what you drive. Saved vehicles first, then the typical sizes, then typing your own. */
export function VehicleStep({
  saved,
  loadingSaved,
  selection,
  usual,
  pending,
  error,
  onSelect,
  onUsualChange,
  onOwnSizes,
  onNext,
  onBack,
}: VehicleStepProps) {
  const { colors, styles } = useStyles();
  const preset = selection?.kind === 'preset' ? selection.id : undefined;
  return (
    <StepFrame
      step={1}
      title="What do you drive?"
      intro="Routes keep clear of the low bridges, narrow roads and weight limits your lorry can't take."
      nextDisabled={selection === undefined}
      pending={pending}
      error={error}
      onNext={onNext}
      onBack={onBack}
      footer={
        <View style={styles.usual}>
          <View style={styles.flex}>
            <Text style={styles.usualTitle}>Set as my usual</Text>
            <Text style={styles.choiceDetail}>Where to? starts with it next time.</Text>
          </View>
          <Switch
            value={usual}
            onValueChange={onUsualChange}
            accessibilityLabel="Set as my usual"
            testID="setup-usual-switch"
          />
        </View>
      }
    >
      {loadingSaved && <ActivityIndicator color={colors.text} />}
      {saved.length > 0 && (
        <>
          <Text style={styles.groupLabel}>Your vehicles</Text>
          {saved.map((p) => (
            <ChoiceCard
              key={p.id}
              selected={selection?.kind === 'profile' && selection.id === p.id}
              title={p.name}
              icon="truck-outline"
              onPress={() => onSelect({ kind: 'profile', id: p.id })}
              testID={`setup-profile-${p.id}`}
            />
          ))}
          <Text style={styles.groupLabel}>Or a typical size</Text>
        </>
      )}
      {VEHICLE_PRESETS.map((p) => (
        <ChoiceCard
          key={p.id}
          selected={preset === p.id}
          title={p.name}
          detail={`${p.dimensions.heightM} m high`}
          drawing={<VehicleDrawing kind={p.drawing} width={64} />}
          onPress={() => onSelect({ kind: 'preset', id: p.id })}
          testID={`setup-preset-${p.id}`}
        />
      ))}
      {preset !== undefined && (
        <Text style={styles.note} testID="setup-preset-note">
          Typical sizes: check the height matches your lorry. You can change any figure later in
          Saved, under My vehicles.
        </Text>
      )}
      <TouchableOpacity
        style={styles.own}
        onPress={onOwnSizes}
        accessibilityRole="button"
        testID="setup-own-sizes"
      >
        <Icon name="tape-measure" size={22} color={colors.accentBlue} />
        <Text style={styles.ownText}>Type my own sizes</Text>
      </TouchableOpacity>
    </StepFrame>
  );
}

export const LOAD_NOTE_NORMAL = 'Plans the usual way, with no hill check.';
export const LOAD_NOTE_HILLS =
  'For a load that does not like steep roads. Checks the hills on each route, and offers one with fewer when there is one. It takes a little longer.';

/** Step 2: what you are carrying. The app's existing two choices and their wording. */
export function LoadStep({
  vehicleName,
  loaded,
  onChange,
  onChangeVehicle,
  onNext,
  onBack,
}: {
  readonly vehicleName: string;
  readonly loaded: boolean;
  readonly onChange: (loaded: boolean) => void;
  readonly onChangeVehicle: () => void;
  readonly onNext: () => void;
  readonly onBack: () => void;
}) {
  return (
    <StepFrame
      step={2}
      title="What are you carrying?"
      intro="Remembered for your next routes. You can change it on any route."
      onNext={onNext}
      onBack={onBack}
      above={<DoneRow text={vehicleName} onChange={onChangeVehicle} testID="setup-done-vehicle" />}
    >
      <ChoiceCard
        selected={!loaded}
        title="Normal"
        detail={LOAD_NOTE_NORMAL}
        icon="package-variant-closed"
        onPress={() => onChange(false)}
        testID="setup-load-normal"
      />
      <ChoiceCard
        selected={loaded}
        title="Hill-sensitive"
        detail={LOAD_NOTE_HILLS}
        icon="image-filter-hdr"
        onPress={() => onChange(true)}
        testID="setup-load-hills"
      />
    </StepFrame>
  );
}

export type StartChoice = 'here' | 'search' | 'map';

/** Step 3: where you are starting. Where I am now is already picked, so most drivers just press Next. */
export function StartStep({
  summary,
  start,
  positionText,
  onChange,
  onChangeLorry,
  onNext,
  onBack,
}: {
  readonly summary: string;
  readonly start: StartChoice;
  /** What the phone's position says: "From your phone's location", or that it is still being found or is off. */
  readonly positionText: string;
  readonly onChange: (start: StartChoice) => void;
  readonly onChangeLorry: () => void;
  readonly onNext: () => void;
  readonly onBack: () => void;
}) {
  const { colors, styles } = useStyles();
  const other = (choice: Exclude<StartChoice, 'here'>, label: string, icon: IconName) => (
    <TouchableOpacity
      style={[styles.tile, start === choice && styles.tileSelected]}
      onPress={() => onChange(choice)}
      accessibilityRole="radio"
      accessibilityState={{ selected: start === choice }}
      testID={`setup-start-${choice}`}
    >
      <Icon name={icon} size={24} color={colors.accentBlue} />
      <Text style={styles.tileText}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <StepFrame
      step={3}
      title="Where are you starting from?"
      onNext={onNext}
      onBack={onBack}
      above={<DoneRow text={summary} onChange={onChangeLorry} testID="setup-done-lorry" />}
    >
      <ChoiceCard
        selected={start === 'here'}
        title="Where I am now"
        detail={positionText}
        icon="crosshairs-gps"
        onPress={() => onChange('here')}
        testID="setup-start-here"
      />
      <Text style={styles.groupLabel}>Planning ahead? Start somewhere else:</Text>
      <View style={styles.tiles}>
        {other('search', 'Search', 'magnify')}
        {other('map', 'Pick on map', 'map-marker-outline')}
      </View>
      {start !== 'here' && (
        <Text style={styles.note}>
          {start === 'search'
            ? 'You search for the start on the next screen.'
            : 'You tap the start on the map on the next screen.'}
        </Text>
      )}
    </StepFrame>
  );
}

/** The Home card for a driver with no lorry yet: the one thing to do first. */
export function SetUpLorryCard({ onPress }: { readonly onPress: () => void }) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.homeCard} testID="setup-lorry-card">
      <View style={styles.homeCardHeader}>
        <View style={styles.homeCardIcon}>
          <Icon name="truck-outline" size={26} color={colors.accentBlue} />
        </View>
        <Text style={styles.homeCardTitle}>Routes that fit your lorry</Text>
      </View>
      <Text style={styles.homeCardBody}>
        {
          "Tell us what you drive once, and every route keeps clear of the low bridges and weight limits it can't take. About 30 seconds."
        }
      </Text>
      <TouchableOpacity
        style={styles.homeCardButton}
        onPress={onPress}
        accessibilityRole="button"
        testID="setup-lorry-button"
      >
        <Text style={styles.nextText}>Set up my lorry</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    frame: { flex: 1, gap: 12 },
    progress: { flexDirection: 'row', gap: 8 },
    bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceStrong },
    barDone: { backgroundColor: colors.accent },
    body: { gap: 10, paddingBottom: 12 },
    stepLabel: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: colors.accentBlue,
    },
    title: { fontSize: 28, fontWeight: '800', color: colors.text },
    intro: { fontSize: 15, lineHeight: 21, color: colors.textSecondary },
    groupLabel: { marginTop: 6, fontSize: 14, color: colors.textMuted },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 60,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radius.card,
      borderWidth: 2,
      borderColor: colors.divider,
      backgroundColor: colors.surface,
    },
    choiceSelected: { borderColor: colors.accent },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.textDim,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: { borderColor: colors.accent },
    radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent },
    choiceText: { flex: 1, gap: 2 },
    choiceTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    choiceDetail: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
    note: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
    own: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 52,
      paddingHorizontal: 14,
      borderRadius: radius.card,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.textDim,
    },
    ownText: { fontSize: 16, fontWeight: '600', color: colors.text },
    usual: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.card,
      backgroundColor: colors.accentSoft,
    },
    usualTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    done: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 48,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: colors.accentSoft,
    },
    doneText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
    link: { fontSize: 15, fontWeight: '600', color: colors.accentBlue },
    tiles: { flexDirection: 'row', gap: 10 },
    tile: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 72,
      borderRadius: radius.card,
      borderWidth: 2,
      borderColor: colors.divider,
      backgroundColor: colors.surface,
    },
    tileSelected: { borderColor: colors.accent },
    tileText: { fontSize: 15, fontWeight: '600', color: colors.text },
    error: { fontSize: 14, color: colors.danger },
    next: {
      minHeight: 58,
      borderRadius: radius.card,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nextDisabled: { opacity: 0.5 },
    nextText: { fontSize: 18, fontWeight: '800', color: colors.textOnAccent },
    back: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    backText: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
    // Kept compact: the map's buttons on the right move down below it, and must still clear the report buttons on a Pixel 6.
    homeCard: {
      gap: 10,
      padding: 16,
      borderRadius: 18,
      backgroundColor: colors.card,
      shadowColor: '#0B1220',
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    homeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    homeCardIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accentSoft,
    },
    homeCardTitle: { flex: 1, fontSize: 19, fontWeight: '800', color: colors.text },
    homeCardBody: { fontSize: 14, lineHeight: 19, color: colors.textSecondary },
    homeCardButton: {
      minHeight: 50,
      borderRadius: radius.card,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
