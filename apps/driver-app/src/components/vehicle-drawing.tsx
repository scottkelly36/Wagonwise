import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { VehicleDrawingKind } from '../lib/vehicle-presets';
import { useThemeColors } from '../theme/colors';

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Drawing {
  readonly cab: Box;
  readonly body: Box;
  /** The coupling between a tractor unit and its trailer. */
  readonly coupling?: Box;
  /** The middle of each wheel along the lorry. One wheel is drawn for each axle, side on. */
  readonly wheels: readonly number[];
}

/** The drawing is laid out on a canvas this big and scaled to the width asked for. The cab is at the left, facing left. */
export const DRAWING_WIDTH = 120;
export const DRAWING_HEIGHT = 48;
const WHEEL = 11;
const WHEEL_Y = 36; // top of a wheel, so its bottom rests on the ground line at 47
const GROUND_Y = 47;

/**
 * Side-on outlines of each size, drawn from plain shapes (no image files and no drawing library, so they ship over the air).
 * They are in the same scale as each other, so a bigger lorry looks longer, and they show one wheel for each axle, so the
 * number of axles can be counted: that is what tells an 18 t from a 26 t from a 32 t.
 */
export const DRAWINGS: Record<VehicleDrawingKind, Drawing> = {
  'small-rigid': {
    cab: { x: 2, y: 14, w: 22, h: 22 },
    body: { x: 26, y: 8, w: 50, h: 28 },
    wheels: [12, 62],
  },
  'rigid-2-axle': {
    cab: { x: 2, y: 12, w: 24, h: 24 },
    body: { x: 28, y: 6, w: 60, h: 30 },
    wheels: [13, 74],
  },
  'rigid-3-axle': {
    cab: { x: 2, y: 12, w: 24, h: 24 },
    body: { x: 28, y: 6, w: 70, h: 30 },
    wheels: [13, 72, 86],
  },
  'rigid-4-axle': {
    cab: { x: 2, y: 12, w: 24, h: 24 },
    body: { x: 28, y: 6, w: 76, h: 30 },
    wheels: [10, 23, 80, 94],
  },
  artic: {
    cab: { x: 2, y: 10, w: 26, h: 26 },
    body: { x: 34, y: 4, w: 82, h: 32 },
    coupling: { x: 27, y: 31, w: 9, h: 5 },
    wheels: [11, 30, 42, 88, 100, 112],
  },
};

/** A small side-on line drawing of a lorry size. Decorative: the name and figures beside it say the same in words. */
export function VehicleDrawing({
  kind,
  width = 100,
}: {
  kind: VehicleDrawingKind;
  width?: number;
}) {
  const colors = useThemeColors();
  const s = width / DRAWING_WIDTH;
  const drawing = DRAWINGS[kind];
  const styles = useMemo(
    () =>
      StyleSheet.create({
        canvas: { width: DRAWING_WIDTH * s, height: DRAWING_HEIGHT * s },
        line: { position: 'absolute', borderColor: colors.textMuted, borderWidth: 2 },
      }),
    [colors, s],
  );
  const place = (b: Box) => ({ left: b.x * s, top: b.y * s, width: b.w * s, height: b.h * s });
  return (
    <View
      style={styles.canvas}
      testID={`vehicle-drawing-${kind}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: GROUND_Y * s,
          width: DRAWING_WIDTH * s,
          height: 1,
          backgroundColor: colors.textDim,
        }}
      />
      <View style={[styles.line, place(drawing.body), { borderRadius: 3 * s }]} />
      <View
        style={[
          styles.line,
          place(drawing.cab),
          { borderTopLeftRadius: 9 * s, borderRadius: 2 * s },
        ]}
      />
      {/* The cab window. */}
      <View
        style={[
          styles.line,
          {
            left: (drawing.cab.x + 4) * s,
            top: (drawing.cab.y + 4) * s,
            width: drawing.cab.w * 0.45 * s,
            height: 7 * s,
            borderWidth: 1.5,
            borderRadius: 2 * s,
          },
        ]}
      />
      {drawing.coupling !== undefined && (
        <View style={[styles.line, place(drawing.coupling), { borderRadius: 1 }]} />
      )}
      {drawing.wheels.map((x, i) => (
        <View
          // The drawings are fixed, so the position along the lorry is a stable key.
          key={`${x}-${i}`}
          testID="vehicle-drawing-wheel"
          style={[
            styles.line,
            {
              left: (x - WHEEL / 2) * s,
              top: WHEEL_Y * s,
              width: WHEEL * s,
              height: WHEEL * s,
              borderRadius: (WHEEL * s) / 2,
              backgroundColor: colors.surface,
            },
          ]}
        />
      ))}
    </View>
  );
}
