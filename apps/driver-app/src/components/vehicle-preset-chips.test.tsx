import { fireEvent, render, screen } from '@testing-library/react-native';

import { VEHICLE_PRESETS } from '../lib/vehicle-presets';
import { VehiclePresetChips } from './vehicle-preset-chips';

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

describe('VehiclePresetChips', () => {
  it('shows every preset by name, each with its drawing', async () => {
    await render(<VehiclePresetChips selectedId={undefined} onPick={jest.fn()} />);
    for (const preset of VEHICLE_PRESETS) {
      expect(screen.getByTestId(`vehicle-preset-chip-${preset.id}`)).toBeTruthy();
      expect(screen.getByText(preset.name)).toBeTruthy();
      expect(
        screen.getByTestId(`vehicle-drawing-${preset.drawing}`, { includeHiddenElements: true }),
      ).toBeTruthy();
    }
  });

  it('hands back the preset that was tapped, and marks the one that is chosen', async () => {
    const onPick = jest.fn();
    await render(<VehiclePresetChips selectedId="rigid-18" onPick={onPick} />);
    await fireEvent.press(screen.getByTestId('vehicle-preset-chip-artic-44'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].id).toBe('artic-44');
    expect(
      screen.getByTestId('vehicle-preset-chip-rigid-18').props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(
      screen.getByTestId('vehicle-preset-chip-artic-44').props.accessibilityState,
    ).toMatchObject({ selected: false });
  });
});
