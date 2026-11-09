import { render, screen } from '@testing-library/react-native';

import { VEHICLE_PRESETS, type VehicleDrawingKind } from '../lib/vehicle-presets';
import { DRAWINGS, DRAWING_WIDTH, VehicleDrawing } from './vehicle-drawing';
import { VehiclePresetPicker } from './vehicle-preset-picker';

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

/** One wheel is drawn for each axle, so the count of wheels is the count of axles. */
const AXLES: Record<VehicleDrawingKind, number> = {
  'small-rigid': 2,
  'rigid-2-axle': 2,
  'rigid-3-axle': 3,
  'rigid-4-axle': 4,
  artic: 6,
};

// The drawings are hidden from a screen reader on purpose, and the test queries skip hidden elements unless asked.
const hidden = { includeHiddenElements: true } as const;

describe('VehicleDrawing', () => {
  it.each(Object.entries(AXLES) as [VehicleDrawingKind, number][])(
    '%s is drawn with %i wheels, one for each axle',
    async (kind, axles) => {
      await render(<VehicleDrawing kind={kind} />);
      expect(screen.getByTestId(`vehicle-drawing-${kind}`, hidden)).toBeTruthy();
      expect(screen.getAllByTestId('vehicle-drawing-wheel', hidden)).toHaveLength(axles);
    },
  );

  it('keeps every part, wheels included, inside the drawing', () => {
    for (const [kind, d] of Object.entries(DRAWINGS)) {
      const parts = [d.cab, d.body, ...(d.coupling === undefined ? [] : [d.coupling])];
      for (const b of parts) {
        expect({ kind, inside: b.x >= 0 && b.x + b.w <= DRAWING_WIDTH }).toEqual({
          kind,
          inside: true,
        });
      }
      for (const x of d.wheels) {
        expect({ kind, inside: x - 5.5 >= 0 && x + 5.5 <= DRAWING_WIDTH }).toEqual({
          kind,
          inside: true,
        });
      }
    }
  });

  it('draws a bigger lorry longer, so the sizes can be told apart at a glance', () => {
    const lengths = VEHICLE_PRESETS.map((p) => {
      const d = DRAWINGS[p.drawing];
      return d.body.x + d.body.w;
    });
    expect([...lengths].sort((a, b) => a - b)).toEqual(lengths);
  });

  it('is decorative: hidden from a screen reader, since the card says the same in words', async () => {
    await render(<VehicleDrawing kind="artic" />);
    expect(
      screen.getByTestId('vehicle-drawing-artic', hidden).props.importantForAccessibility,
    ).toBe('no-hide-descendants');
  });
});

describe('the preset cards', () => {
  it('each shows the drawing for its own size', async () => {
    await render(<VehiclePresetPicker selectedId={undefined} onPick={jest.fn()} />);
    for (const preset of VEHICLE_PRESETS) {
      expect(screen.getByTestId(`vehicle-drawing-${preset.drawing}`, hidden)).toBeTruthy();
    }
    expect(screen.getAllByTestId('vehicle-drawing-wheel', hidden)).toHaveLength(
      VEHICLE_PRESETS.reduce((sum, p) => sum + AXLES[p.drawing], 0),
    );
  });
});
