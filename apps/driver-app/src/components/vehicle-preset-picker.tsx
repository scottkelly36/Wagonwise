import { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import { metresToFeetInches } from '../lib/units';
import { VEHICLE_PRESETS, type VehiclePreset } from '../lib/vehicle-presets';
import { VehicleDrawing } from './vehicle-drawing';
import { useThemeColors, type ThemeColors } from '../theme/colors';

interface Props {
  readonly selectedId: string | undefined;
  readonly onPick: (preset: VehiclePreset) => void;
}

/**
 * The figures a preset will fill in, on two short lines so none wraps on a phone: the height (also in feet and inches, as UK
 * bridge signs show it) and the weight first, since those matter most, then the width and length.
 */
export function presetFigures(preset: VehiclePreset): {
  readonly main: string;
  readonly size: string;
} {
  const d = preset.dimensions;
  return {
    main: `${d.heightM} m (${metresToFeetInches(d.heightM)}) high · ${d.grossWeightT} t`,
    size: `${d.widthM} m wide · ${d.lengthM} m long`,
  };
}

/** The gap between cards in the row. */
const GAP = 10;

/**
 * Typical lorry sizes to start from, for a driver who does not know their exact figures. A row of cards that scrolls sideways
 * (so the five of them take one card's height, not five), with the next card peeking in to show there are more. Picking one
 * fills the figures, which the driver still sees on the card and can change by switching to Metres or Feet & inches.
 */
export function VehiclePresetPicker({ selectedId, onPick }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: screenWidth } = useWindowDimensions();
  // Wide enough to read, and narrow enough that the next card shows at the edge: that peek is what says "swipe".
  const cardWidth = Math.min(300, Math.max(230, screenWidth - 32 - 56));
  return (
    <View style={styles.wrap} testID="vehicle-preset-picker">
      <Text style={styles.title}>Pick the nearest match</Text>
      <Text style={styles.body}>
        These are typical sizes, not your exact vehicle. Check the height most of all: it decides
        which low bridges you are sent under. Swipe sideways for the other sizes.
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + GAP}
        decelerationRate="fast"
        contentContainerStyle={styles.cards}
        testID="vehicle-preset-cards"
      >
        {VEHICLE_PRESETS.map((preset) => {
          const selected = preset.id === selectedId;
          const figures = presetFigures(preset);
          return (
            <TouchableOpacity
              key={preset.id}
              style={[styles.card, { width: cardWidth }, selected && styles.cardSelected]}
              onPress={() => onPick(preset)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${preset.name}. ${figures.main}. ${figures.size}`}
              testID={`vehicle-preset-${preset.id}`}
            >
              <VehicleDrawing kind={preset.drawing} width={132} />
              <Text style={styles.name}>{preset.name}</Text>
              <Text style={styles.description}>{preset.description}</Text>
              <Text style={styles.figuresMain}>{figures.main}</Text>
              <Text style={styles.figures}>{figures.size}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Text style={styles.body}>
        A tall or double-deck trailer, or a wide or long load? Pick the nearest, then switch to
        Metres or Feet &amp; inches to change the size.
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    title: { fontSize: 20, fontWeight: '700', color: colors.text },
    body: { fontSize: 14, color: colors.textMuted },
    cards: { gap: GAP, paddingVertical: 2 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: 'transparent',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 3,
    },
    cardSelected: { borderColor: colors.accent },
    name: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 6 },
    description: { fontSize: 14, color: colors.textMuted },
    figuresMain: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 4 },
    figures: { fontSize: 14, color: colors.textMuted },
  });
}
