import { fireEvent, render, screen } from '@testing-library/react-native';

import { VEHICLE_PRESETS } from '../lib/vehicle-presets';
import { VehiclePresetPicker, presetFigures } from './vehicle-preset-picker';

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

describe('VehiclePresetPicker', () => {
  it('shows every preset with its figures, and the height in feet and inches too', async () => {
    await render(<VehiclePresetPicker selectedId={undefined} onPick={jest.fn()} />);
    for (const preset of VEHICLE_PRESETS) {
      expect(screen.getByTestId(`vehicle-preset-${preset.id}`)).toBeTruthy();
      expect(screen.getByText(preset.name)).toBeTruthy();
      const figures = presetFigures(preset);
      expect(screen.getByText(figures.main)).toBeTruthy();
      expect(screen.getByText(figures.size)).toBeTruthy();
    }
    expect(presetFigures(VEHICLE_PRESETS[VEHICLE_PRESETS.length - 1]!)).toEqual({
      main: `4.2 m (13'9") high · 44 t`,
      size: '2.55 m wide · 16.5 m long',
    });
  });

  it('tells the driver to check the height', async () => {
    await render(<VehiclePresetPicker selectedId={undefined} onPick={jest.fn()} />);
    expect(screen.getByText(/Check the height most of all/)).toBeTruthy();
  });

  it('hands back the preset that was tapped, and marks the chosen one', async () => {
    const onPick = jest.fn();
    await render(<VehiclePresetPicker selectedId="rigid-26" onPick={onPick} />);
    await fireEvent.press(screen.getByTestId('vehicle-preset-artic-44'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].id).toBe('artic-44');
    expect(screen.getByTestId('vehicle-preset-rigid-26').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByTestId('vehicle-preset-artic-44').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('puts the cards in one row that scrolls sideways, so five sizes take one card of height', async () => {
    await render(<VehiclePresetPicker selectedId={undefined} onPick={jest.fn()} />);
    expect(screen.getByTestId('vehicle-preset-cards').props.horizontal).toBe(true);
    expect(screen.getByText(/Swipe sideways/)).toBeTruthy();
  });
});
