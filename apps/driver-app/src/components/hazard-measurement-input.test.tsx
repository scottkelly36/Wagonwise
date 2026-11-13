import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { useLengthUnitStore } from '../state/length-unit-store';
import { HazardMeasurementInput } from './hazard-measurement-input';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

beforeEach(() => useLengthUnitStore.setState({ unit: 'metres' }));

/** Holds the value the way the report screen does, in metres as text. */
function Harness({
  kind,
  onValue,
}: {
  kind: 'height' | 'width' | 'weight';
  onValue: (v: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <HazardMeasurementInput
      kind={kind}
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue(v);
      }}
    />
  );
}

describe('HazardMeasurementInput', () => {
  it('takes feet and inches for a bridge and gives metres, so 13 ft 9 in is 4.19 and not 13.9', async () => {
    useLengthUnitStore.setState({ unit: 'feet' });
    const onValue = jest.fn();
    await render(<Harness kind="height" onValue={onValue} />);
    await fireEvent.changeText(screen.getByTestId('hazard-measurement-feet-input'), '13');
    await fireEvent.changeText(screen.getByTestId('hazard-measurement-inches-input'), '9');
    expect(onValue).toHaveBeenLastCalledWith('4.191');
    expect(screen.getByTestId('hazard-measurement-echo').props.children).toBe('4.19 m');
  });

  it('takes metres as before, and shows the feet and inches under a height so feet typed as metres is seen', async () => {
    const onValue = jest.fn();
    await render(<Harness kind="height" onValue={onValue} />);
    await fireEvent.changeText(screen.getByTestId('hazard-measurement-input'), '13.9');
    expect(onValue).toHaveBeenLastCalledWith('13.9');
    expect(screen.getByTestId('hazard-measurement-echo').props.children).toContain("45'");
  });

  it('keeps a weight in tonnes whatever the driver chose for sizes', async () => {
    useLengthUnitStore.setState({ unit: 'feet' });
    await render(<Harness kind="weight" onValue={jest.fn()} />);
    expect(screen.getByTestId('hazard-measurement-input')).toBeTruthy();
    expect(screen.queryByTestId('hazard-measurement-feet-input')).toBeNull();
  });
});
